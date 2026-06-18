import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../services/database_service.dart';
import '../services/sync_service.dart';
import '../services/route_service.dart';
import '../services/map_data_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MapScreen extends StatefulWidget {
  final String userToken;

  const MapScreen({Key? key, required this.userToken}) : super(key: key);

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final DatabaseService _db = DatabaseService();
  final SyncService _syncService = SyncService();
  final MapDataService _mapDataService = MapDataService();
  
  final MapController _mapController = MapController();
  LatLng _currentLocation = LatLng(-9.9133, -63.0408); // Ariquemes default
  
  bool _isOnline = true;
  String _userName = 'Usuário';

  // MAP LAYERS STATE
  bool _showRoads = true;
  bool _showIncidents = true;
  bool _showInfoCards = true;
  List<RuralLine> _ruralRoads = [];
  List<Incident> _incidentes = [];
  bool _isLoadingLayers = false;
  
  // TRACKING
  bool _isTrackingRoute = false;
  List<LatLng> _currentRoutePoints = [];
  DateTime? _routeStartTime;
  double _trackingDistanceMeters = 0.0;
  
  // POLÍGONO (Área Rural)
  bool _isDrawingPolygon = false;
  List<LatLng> _currentPolygonPoints = [];
  
  // ROTEAMENTO A->B
  bool _isRoutingMode = false;
  LatLng? _routeOrigin;
  LatLng? _routeDestination;
  RouteResult? _routeResult;
  bool _isCalculatingRoute = false;

  int _pendingIncidentsCount = 0;
  int _pendingRoutesCount = 0;
  int _pendingAreasCount = 0;

  StreamSubscription<Position>? _positionSubscription;
  StreamSubscription<ConnectivityResult>? _connectivitySubscription;
  Timer? _trackingTimer;
  Duration _trackingDuration = Duration.zero;

  // REALTIME CHANNELS
  RealtimeChannel? _linhasChannel;
  RealtimeChannel? _incidentesChannel;

  @override
  void initState() {
    super.initState();
    _checkInitialConnectivity();
    _subscribeConnectivity();
    _determinePosition();
    _updatePendingCounts();
    _loadMapLayers(); // Carregar camadas de mapas do Supabase
    _fetchUserName(); // Buscar nome do usuário
    _setupRealtime(); // Escutar atualizações em tempo real

    _syncService.startAutoSync(widget.userToken);
  }

  void _setupRealtime() {
    _linhasChannel = Supabase.instance.client
        .channel('public:linhas_rurais')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'linhas_rurais',
          callback: (payload) {
            print('🔄 Realtime: Atualização em linhas_rurais detectada!');
            _loadMapLayers(); // Recarregar para refletir mudanças
          },
        )
        .subscribe();

    _incidentesChannel = Supabase.instance.client
        .channel('public:reportes_incidentes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'reportes_incidentes',
          callback: (payload) {
            print('🔄 Realtime: Atualização em reportes_incidentes detectada!');
            _loadMapLayers(); // Recarregar para refletir mudanças
          },
        )
        .subscribe();
  }

  void _fetchUserName() {
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      final name = user.userMetadata?['name'] ?? user.email ?? 'Usuário';
      setState(() {
        _userName = name;
      });
    }
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    _connectivitySubscription?.cancel();
    _trackingTimer?.cancel();
    _linhasChannel?.unsubscribe();
    _incidentesChannel?.unsubscribe();
    _syncService.stopAutoSync();
    super.dispose();
  }

  Future<void> _loadMapLayers() async {
    setState(() => _isLoadingLayers = true);
    final roads = await _mapDataService.fetchLinhasRurais();
    final incidents = await _mapDataService.fetchIncidentes();
    if (mounted) {
      setState(() {
        _ruralRoads = roads;
        _incidentes = incidents;
        _isLoadingLayers = false;
      });
    }
  }

  // --------------------------------------------------------------------------
  // LÓGICA DE CONECTIVIDADE E FILA OFFLINE
  // --------------------------------------------------------------------------
  Future<void> _checkInitialConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    _updateOnlineStatus(result);
  }

  void _subscribeConnectivity() {
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((result) {
      _updateOnlineStatus(result);
      _updatePendingCounts();
      // Recarregar dados se voltar a ficar online
      if (result != ConnectivityResult.none) {
        _loadMapLayers();
      }
    });
  }

  void _updateOnlineStatus(ConnectivityResult result) {
    final hasNet = result == ConnectivityResult.wifi || 
                   result == ConnectivityResult.mobile;
    setState(() {
      _isOnline = hasNet;
    });
  }

  Future<void> _updatePendingCounts() async {
    final incs = await _db.getOfflineIncidents();
    final rts = await _db.getOfflineRoutes();
    final areas = await _db.getOfflineAreas();
    setState(() {
      _pendingIncidentsCount = incs.length;
      _pendingRoutesCount = rts.length;
      _pendingAreasCount = areas.length;
    });

    // Tentar enviar para a nuvem automaticamente de forma transparente se houver internet
    final totalPending = _pendingIncidentsCount + _pendingRoutesCount + _pendingAreasCount;
    if (_isOnline && totalPending > 0) {
      final ok = await _syncService.syncOfflineData(widget.userToken);
      if (ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sincronização automática concluída!')));
        
        // Zera os contadores visualmente após o sucesso
        setState(() {
          _pendingIncidentsCount = 0;
          _pendingRoutesCount = 0;
          _pendingAreasCount = 0;
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // LÓGICA DE GEOLOCALIZAÇÃO E TRACKING
  // --------------------------------------------------------------------------
  Future<void> _determinePosition() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }

    if (permission == LocationPermission.deniedForever) return;

    final position = await Geolocator.getCurrentPosition();
    setState(() {
      _currentLocation = LatLng(position.latitude, position.longitude);
    });
    
    _mapController.move(_currentLocation, 12.0);
  }

  void _toggleRouteTracking() async {
    if (_isTrackingRoute) {
      await _positionSubscription?.cancel();
      _trackingTimer?.cancel();
      
      if (_currentRoutePoints.length >= 2 && _trackingDistanceMeters > 50) {
        final novaRota = {
          'id': DateTime.now().millisecondsSinceEpoch.toString(),
          'coordenadas': _currentRoutePoints.map((p) => [p.longitude, p.latitude]).toList(),
          'data_inicio': _routeStartTime?.toIso8601String(),
          'data_fim': DateTime.now().toUtc().toIso8601String()
        };
        
        await _db.saveRouteOffline(novaRota);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('🚗 Rota de ${(_trackingDistanceMeters/1000).toStringAsFixed(1)}km salva com sucesso!'))
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('⚠️ Rota muito curta para ser registrada (mín 50m).'))
        );
      }

      setState(() {
        _isTrackingRoute = false;
        _currentRoutePoints.clear();
        _trackingDistanceMeters = 0.0;
        _trackingDuration = Duration.zero;
      });
      _updatePendingCounts();
    } else {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission != LocationPermission.always && permission != LocationPermission.whileInUse) return;

      setState(() {
        _isTrackingRoute = true;
        _routeStartTime = DateTime.now().toUtc();
        _currentRoutePoints.clear();
        _currentRoutePoints.add(_currentLocation);
        _trackingDistanceMeters = 0.0;
        _trackingDuration = Duration.zero;
      });

      _trackingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        setState(() {
          _trackingDuration = DateTime.now().toUtc().difference(_routeStartTime!);
        });
      });

      _positionSubscription = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
      ).listen((Position position) {
        setState(() {
          final newPt = LatLng(position.latitude, position.longitude);
          if (_currentRoutePoints.isNotEmpty) {
            final lastPt = _currentRoutePoints.last;
            _trackingDistanceMeters += Geolocator.distanceBetween(
              lastPt.latitude, lastPt.longitude, newPt.latitude, newPt.longitude
            );
          }
          _currentRoutePoints.add(newPt);
          _currentLocation = newPt;
        });
        _mapController.move(_currentLocation, _mapController.camera.zoom);
      });
    }
  }

  // --------------------------------------------------------------------------
  // MAPEAMENTO DE ÁREAS (POLÍGONOS)
  // --------------------------------------------------------------------------
  void _toggleDrawingMode() {
    setState(() {
      _isDrawingPolygon = !_isDrawingPolygon;
      if (!_isDrawingPolygon) {
        _currentPolygonPoints.clear();
      } else {
        _disableOtherModes('polygon');
      }
    });
  }

  void _finishPolygon() {
    if (_currentPolygonPoints.length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Mínimo de 3 pontos para polígono.')));
      return;
    }

    final nomeController = TextEditingController();
    String selectedStatus = 'normal';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF161a22),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, top: 20, left: 20, right: 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Salvar Área', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  TextField(controller: nomeController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Nome da Área')),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: selectedStatus,
                    dropdownColor: const Color(0xFF161a22),
                    style: const TextStyle(color: Colors.white),
                    items: const [
                      DropdownMenuItem(value: 'normal', child: Text('Normal (Verde)')),
                      DropdownMenuItem(value: 'atencao', child: Text('Atenção (Amarelo)')),
                      DropdownMenuItem(value: 'critico', child: Text('Crítico (Vermelho)')),
                    ],
                    onChanged: (val) => setModalState(() => selectedStatus = val!),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00f2fe), foregroundColor: Colors.black),
                    onPressed: () async {
                      if (nomeController.text.isEmpty) return;
                      final area = {
                        'id': DateTime.now().millisecondsSinceEpoch.toString(),
                        'nome': nomeController.text,
                        'status_situacao': selectedStatus,
                        'coordinates': _currentPolygonPoints.map((p) => [p.longitude, p.latitude]).toList()
                      };
                      await _db.saveAreaOffline(area);
                      if (mounted) {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Área salva!')));
                        setState(() { _isDrawingPolygon = false; _currentPolygonPoints.clear(); });
                        _updatePendingCounts();
                      }
                    },
                    child: const Text('Salvar'),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            );
          }
        );
      }
    );
  }

  // --------------------------------------------------------------------------
  // CÁLCULO DE ROTAS A -> B
  // --------------------------------------------------------------------------
  void _toggleRoutingMode() {
    setState(() {
      _isRoutingMode = !_isRoutingMode;
      if (!_isRoutingMode) {
        _routeOrigin = null;
        _routeDestination = null;
        _routeResult = null;
      } else {
        _disableOtherModes('route');
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Modo Rota: Toque na ORIGEM.')));
      }
    });
  }

  Future<void> _calculateRoute() async {
    if (_routeOrigin == null || _routeDestination == null) return;
    setState(() => _isCalculatingRoute = true);
    final result = await RouteService.calculateRoute(_routeOrigin!, _routeDestination!);
    setState(() {
      _isCalculatingRoute = false;
      if (result != null) {
        _routeResult = result;
        final bounds = LatLngBounds.fromPoints(result.coordinates);
        _mapController.fitCamera(CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(50)));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Erro no OSRM.')));
        _routeOrigin = null;
        _routeDestination = null;
      }
    });
  }

  void _handleMapTap(TapPosition tapPosition, LatLng point) {
    if (_isDrawingPolygon) {
      setState(() => _currentPolygonPoints.add(point));
    } else if (_isRoutingMode) {
      if (_routeOrigin == null) {
        setState(() => _routeOrigin = point);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Origem definida. Toque no DESTINO.')));
      } else if (_routeDestination == null) {
        setState(() => _routeDestination = point);
        _calculateRoute();
      } else {
        setState(() { _routeOrigin = point; _routeDestination = null; _routeResult = null; });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nova Origem definida. Toque no DESTINO.')));
      }
    } else if (_showRoads) {
      // Detect clicked road
      RuralLine? clickedRoad;
      double minDistance = double.infinity;

      for (final road in _ruralRoads) {
        for (int i = 0; i < road.coordinates.length - 1; i++) {
          final p1 = road.coordinates[i];
          final p2 = road.coordinates[i + 1];
          final dist = _distanceToSegment(point, p1, p2);
          if (dist < 150 && dist < minDistance) { // within ~150 meters
            minDistance = dist;
            clickedRoad = road;
          }
        }
      }

      if (clickedRoad != null) {
        _showRoadDetails(clickedRoad);
      }
    }
  }

  double _distanceToSegment(LatLng p, LatLng a, LatLng b) {
    final x = p.longitude;
    final y = p.latitude;
    final x1 = a.longitude;
    final y1 = a.latitude;
    final x2 = b.longitude;
    final y2 = b.latitude;

    final A = x - x1;
    final B = y - y1;
    final C = x2 - x1;
    final D = y2 - y1;

    final dot = A * C + B * D;
    final lenSq = C * C + D * D;
    double param = -1;
    if (lenSq != 0) {
      param = dot / lenSq;
    }

    double xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    final dx = x - xx;
    final dy = y - yy;
    
    return math.sqrt(dx * dx + dy * dy) * 111000;
  }

  void _showRoadDetails(RuralLine road) {
    String selectedStatus = road.statusTrafego;
    
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF161a22),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(road.nome, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('Risco: ${road.indiceRisco.toStringAsFixed(1)}', style: const TextStyle(color: Colors.grey)),
                  const SizedBox(height: 20),
                  const Text('Alterar Situação:', style: TextStyle(color: Colors.white70, fontSize: 16)),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _statusButton('livre', 'LIVRE', const Color(0xFF00e676), selectedStatus, () => setModalState(() => selectedStatus = 'livre')),
                      _statusButton('atencao', 'ATENÇÃO', const Color(0xFFffea00), selectedStatus, () => setModalState(() => selectedStatus = 'atencao')),
                      _statusButton('bloqueado', 'BLOQUEADO', const Color(0xFFff3d00), selectedStatus, () => setModalState(() => selectedStatus = 'bloqueado')),
                    ],
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00f2fe),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: () async {
                      Navigator.pop(context);
                      final success = await _mapDataService.updateRoadStatus(road.id, selectedStatus);
                      if (success && mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Status atualizado!')));
                      } else if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Erro ao atualizar status.')));
                      }
                    },
                    child: const Text('Salvar Status', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  )
                ],
              ),
            );
          }
        );
      }
    );
  }

  Widget _statusButton(String status, String label, Color color, String currentStatus, VoidCallback onTap) {
    final isSelected = currentStatus == status;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.2) : Colors.transparent,
          border: Border.all(color: isSelected ? color : Colors.grey.withOpacity(0.5), width: 2),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label, style: TextStyle(color: isSelected ? color : Colors.grey, fontWeight: FontWeight.bold, fontSize: 12)),
      ),
    );
  }

  void _disableOtherModes(String activeMode) {
    if (activeMode != 'polygon') {
      _isDrawingPolygon = false;
      _currentPolygonPoints.clear();
    }
    if (activeMode != 'route') {
      _isRoutingMode = false;
      _routeOrigin = null;
      _routeDestination = null;
      _routeResult = null;
    }
  }

  void _showAddIncidentDialog() {
    String selectedTipo = 'atolamento';
    final descController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF161a22),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, top: 20, left: 20, right: 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Registrar Ponto Crítico', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: selectedTipo,
                    dropdownColor: const Color(0xFF161a22),
                    style: const TextStyle(color: Colors.white),
                    items: [
                      DropdownMenuItem(value: 'atolamento', child: Row(children: [const Icon(Icons.directions_car, color: Colors.redAccent, size: 20), const SizedBox(width: 8), const Text('Atolamento de Veículo')])),
                      DropdownMenuItem(value: 'erosao', child: Row(children: [const Icon(Icons.warning, color: Colors.orangeAccent, size: 20), const SizedBox(width: 8), const Text('Erosão da Pista')])),
                      DropdownMenuItem(value: 'bueiro_danificado', child: Row(children: [const Icon(Icons.water_damage, color: Colors.brown, size: 20), const SizedBox(width: 8), const Text('Bueiro Danificado')])),
                      DropdownMenuItem(value: 'ponte_caida', child: Row(children: [const Icon(Icons.broken_image, color: Colors.red, size: 20), const SizedBox(width: 8), const Text('Ponte Danificada/Caída')])),
                      DropdownMenuItem(value: 'alagamento', child: Row(children: [const Icon(Icons.flood, color: Colors.blueAccent, size: 20), const SizedBox(width: 8), const Text('Alagamento de Pista')])),
                      DropdownMenuItem(value: 'buraco_severo', child: Row(children: [const Icon(Icons.remove_circle_outline, color: Colors.orange, size: 20), const SizedBox(width: 8), const Text('Buraco Severo na Pista')])),
                      DropdownMenuItem(value: 'queda_arvore', child: Row(children: [const Icon(Icons.nature, color: Colors.green, size: 20), const SizedBox(width: 8), const Text('Queda de Árvore')])),
                      DropdownMenuItem(value: 'deslizamento', child: Row(children: [const Icon(Icons.landslide, color: Colors.brown, size: 20), const SizedBox(width: 8), const Text('Deslizamento de Terra')])),
                      DropdownMenuItem(value: 'animal_na_pista', child: Row(children: [const Icon(Icons.pets, color: Colors.yellowAccent, size: 20), const SizedBox(width: 8), const Text('Animal na Pista')])),
                      DropdownMenuItem(value: 'obra_em_andamento', child: Row(children: [const Icon(Icons.construction, color: Colors.amber, size: 20), const SizedBox(width: 8), const Text('Obra em Andamento')])),
                    ],
                    onChanged: (val) => setModalState(() => selectedTipo = val!),
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: descController, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(labelText: 'Descrição')),
                  const SizedBox(height: 20),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00f2fe), foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14)),
                    icon: const Icon(Icons.add_location_alt),
                    label: const Text('Salvar na Minha Localização', style: TextStyle(fontWeight: FontWeight.bold)),
                    onPressed: () async {
                      final novoIncidente = {
                        'id': DateTime.now().millisecondsSinceEpoch.toString(),
                        'tipo_problema': selectedTipo,
                        'descricao': descController.text,
                        'latitude': _currentLocation.latitude,
                        'longitude': _currentLocation.longitude,
                        'data_criacao_dispositivo': DateTime.now().toUtc().toIso8601String(),
                        'resolvido': false
                      };
                      await _db.saveIncidentOffline(novoIncidente);
                      if (mounted) {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ponto registrado localmente!')));
                        _updatePendingCounts();
                      }
                    },
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            );
          },
        );
      },
    );
  }

  String _formatDuration(Duration d) {
    String twoDigits(int n) => n.toString().padLeft(2, "0");
    return "${twoDigits(d.inHours)}:${twoDigits(d.inMinutes.remainder(60))}:${twoDigits(d.inSeconds.remainder(60))}";
  }

  // --------------------------------------------------------------------------
  // COMPONENTES UI FLUTUANTES (CARDS E MENUS)
  // --------------------------------------------------------------------------
  Widget _buildLayersMenu() {
    return Positioned(
      top: 60, right: 16,
      child: PopupMenuButton<String>(
        icon: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: const Color(0xFF161a22).withOpacity(0.9), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.white.withOpacity(0.2))),
          child: const Icon(Icons.layers, color: Colors.white),
        ),
        color: const Color(0xFF161a22),
        onSelected: (value) {
          setState(() {
            if (value == 'roads') _showRoads = !_showRoads;
            if (value == 'incidents') _showIncidents = !_showIncidents;
            if (value == 'cards') _showInfoCards = !_showInfoCards;
          });
        },
        itemBuilder: (context) => [
          CheckedPopupMenuItem(value: 'roads', checked: _showRoads, child: const Text('Estradas Rurais', style: TextStyle(color: Colors.white))),
          CheckedPopupMenuItem(value: 'incidents', checked: _showIncidents, child: const Text('Ocorrências', style: TextStyle(color: Colors.white))),
          CheckedPopupMenuItem(value: 'cards', checked: _showInfoCards, child: const Text('Painéis Informativos', style: TextStyle(color: Colors.white))),
        ],
      ),
    );
  }

  Widget _buildWeatherCard() {
    return Positioned(
      top: 60, left: 16,
      child: Container(
        width: 250, padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF161a22).withOpacity(0.95), borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 10)]
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.cloud_outlined, color: Colors.blueAccent, size: 18),
                const SizedBox(width: 8),
                const Text('Clima / Ariquemes', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.wb_sunny, color: Colors.orange, size: 28),
                    const SizedBox(width: 8),
                    const Text('22°C', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text('💧 2.2 mm', style: TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold, fontSize: 12)),
                    Text('Chuva (24h)', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9)),
                  ],
                )
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildWeatherMiniInfo(Icons.air, '1.9 km/h', 'Vento'),
                _buildWeatherMiniInfo(Icons.water_drop, '99%', 'Umidade'),
                _buildWeatherMiniInfo(Icons.speed, '1001 hPa', 'Pressão'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWeatherMiniInfo(IconData icon, String value, String label) {
    return Column(
      children: [
        Icon(icon, color: Colors.white.withOpacity(0.5), size: 14),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
        Text(label, style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9)),
      ],
    );
  }

  Widget _buildRoadsSummaryCard() {
    if (_ruralRoads.isEmpty) return const SizedBox.shrink();
    int livre = _ruralRoads.where((r) => r.statusTrafego == 'livre').length;
    int atencao = _ruralRoads.where((r) => r.statusTrafego == 'atencao').length;
    int bloqueado = _ruralRoads.where((r) => r.statusTrafego == 'bloqueado').length;

    return Positioned(
      bottom: 220, left: 16,
      child: Container(
        width: 180, padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF161a22).withOpacity(0.95), borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Situação das Vias', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
            const SizedBox(height: 8),
            _buildSummaryRow(const Color(0xFF00e676), 'Livre', livre),
            const SizedBox(height: 4),
            _buildSummaryRow(const Color(0xFFffea00), 'Atenção', atencao),
            const SizedBox(height: 4),
            _buildSummaryRow(const Color(0xFFff3d00), 'Bloqueado', bloqueado),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryRow(Color color, String label, int count) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
          ],
        ),
        Text(count.toString(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
      ],
    );
  }

  // --------------------------------------------------------------------------
  // BUILD PRINCIPAL
  // --------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final totalPending = _pendingIncidentsCount + _pendingRoutesCount + _pendingAreasCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('TrafegoAlert', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0d0f12),
        foregroundColor: Colors.white,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: Chip(
              backgroundColor: _isOnline ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
              label: Text(_isOnline ? 'ONLINE' : 'OFFLINE', style: TextStyle(color: _isOnline ? Colors.greenAccent : Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 10)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.account_circle, color: Colors.white),
            onPressed: () {
              // Exibir modal de perfil com botão de logout
              showModalBottomSheet(
                context: context,
                backgroundColor: const Color(0xFF161a22),
                builder: (context) {
                  return Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircleAvatar(radius: 30, backgroundColor: Color(0xFF00f2fe), child: Icon(Icons.person, size: 30, color: Colors.black)),
                        const SizedBox(height: 16),
                        Text(_userName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Text('Conectado à plataforma', style: TextStyle(color: Colors.white.withOpacity(0.7))),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12)),
                            icon: const Icon(Icons.logout),
                            label: const Text('Sair do Aplicativo', style: TextStyle(fontWeight: FontWeight.bold)),
                            onPressed: () async {
                              Navigator.pop(context); // Fechar modal
                              await Supabase.instance.client.auth.signOut();
                              // A AuthGate do main.dart escutará a saída e jogará para a LoginScreen
                            },
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                    ),
                  );
                }
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(initialCenter: _currentLocation, initialZoom: 12.0, onTap: _handleMapTap),
            children: [
              TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.quanyx.trafegoalert'),
              
              // CAMADA: ESTRADAS RURAIS (SUPABASE)
              if (_showRoads && _ruralRoads.isNotEmpty)
                PolylineLayer(
                  polylines: _ruralRoads.map((road) => Polyline(
                    points: road.coordinates,
                    color: road.color,
                    strokeWidth: 5.0,
                    isDotted: road.pavimentada == false && road.statusTrafego != 'livre', // Destacar problemas se terra
                  )).toList(),
                ),

              // CAMADA: INCIDENTES (SUPABASE)
              if (_showIncidents && _incidentes.isNotEmpty)
                MarkerLayer(
                  markers: _incidentes.map((inc) => Marker(
                    point: inc.position, width: 32, height: 32,
                    child: Container(
                      decoration: BoxDecoration(color: inc.color, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2), boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 4)]),
                      child: Icon(inc.icon, color: Colors.white, size: 18),
                    ),
                  )).toList(),
                ),

              // CAMADAS INTERATIVAS MODO POLÍGONO/ROTA...
              if (_isDrawingPolygon && _currentPolygonPoints.isNotEmpty)
                PolygonLayer(polygons: [Polygon(points: _currentPolygonPoints, color: Colors.yellow.withOpacity(0.3), borderColor: Colors.yellow, borderStrokeWidth: 2, isFilled: true)]),
              if (_isDrawingPolygon && _currentPolygonPoints.isNotEmpty)
                MarkerLayer(markers: _currentPolygonPoints.map((p) => Marker(point: p, width: 12, height: 12, child: Container(decoration: const BoxDecoration(color: Colors.yellow, shape: BoxShape.circle)))).toList()),
              
              if (_currentRoutePoints.isNotEmpty)
                PolylineLayer(polylines: [Polyline(points: _currentRoutePoints, color: Colors.blueAccent, strokeWidth: 5.0, isDotted: true)]),
                
              if (_routeResult != null)
                PolylineLayer(polylines: [Polyline(points: _routeResult!.coordinates, color: const Color(0xFF00f2fe), strokeWidth: 6.0)]),
              
              if (_routeOrigin != null || _routeDestination != null)
                MarkerLayer(
                  markers: [
                    if (_routeOrigin != null) Marker(point: _routeOrigin!, width: 40, height: 40, child: const Icon(Icons.location_on, color: Colors.green, size: 40)),
                    if (_routeDestination != null) Marker(point: _routeDestination!, width: 40, height: 40, child: const Icon(Icons.location_on, color: Colors.red, size: 40)),
                  ],
                ),

              MarkerLayer(markers: [Marker(point: _currentLocation, width: 24, height: 24, child: Container(decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.3), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)), child: Center(child: Container(width: 12, height: 12, decoration: const BoxDecoration(color: Colors.blue, shape: BoxShape.circle)))))])
            ],
          ),

          // OVERLAYS UI DE CAMADAS E CLIMA
          _buildLayersMenu(),
          if (!_isRoutingMode && !_isDrawingPolygon && !_isTrackingRoute && _showInfoCards) _buildWeatherCard(),
          if (!_isRoutingMode && !_isDrawingPolygon && !_isTrackingRoute && _showRoads && _showInfoCards) _buildRoadsSummaryCard(),

          // AVISO DE CARREGAMENTO DO SUPABASE
          if (_isLoadingLayers)
            const Positioned(top: 16, right: 70, child: CircularProgressIndicator(color: Color(0xFF00f2fe))),

          // OVERLAYS RESTANTES (Gravando, OSRM, Pendentes)...
          if (_isTrackingRoute)
            Positioned(top: 16, right: 16, left: 16, child: Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.blueAccent)), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('GRAVANDO TRAJETO', style: TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold, fontSize: 10)), Text('${(_trackingDistanceMeters / 1000).toStringAsFixed(2)} km', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold))]), Text(_formatDuration(_trackingDuration), style: const TextStyle(color: Colors.white, fontSize: 16, fontFamily: 'monospace'))]))),

          if (_routeResult != null && !_isTrackingRoute)
            Positioned(top: 16, right: 16, left: 16, child: Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF00f2fe))), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('ROTA OSRM', style: TextStyle(color: Color(0xFF00f2fe), fontWeight: FontWeight.bold, fontSize: 10)), Text(_routeResult!.distanceText, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold))]), Text(_routeResult!.durationText, style: const TextStyle(color: Colors.white, fontSize: 18))]))),

          if (totalPending > 0 && !_isTrackingRoute && _routeResult == null)
            Positioned(top: 16, left: 16, right: 70, child: Container(padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16), decoration: BoxDecoration(color: const Color(0xFF161a22).withOpacity(0.95), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.orange.withOpacity(0.3))), child: Row(children: [const Icon(Icons.cloud_upload_outlined, color: Colors.orange, size: 16), const SizedBox(width: 8), Expanded(child: Text('Pendentes: $totalPending registros', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w500))), if (_isOnline) TextButton(onPressed: () async { final ok = await _syncService.syncOfflineData(widget.userToken); if (ok) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sincronização concluída!'))); _updatePendingCounts(); } }, child: const Text('SYNC', style: TextStyle(color: Color(0xFF00f2fe), fontSize: 10)))]))),
            
          if (_isCalculatingRoute) const Center(child: CircularProgressIndicator(color: Color(0xFF00f2fe))),

          if (_isDrawingPolygon)
            Positioned(bottom: 100, left: 16, right: 16, child: Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(10)), child: Column(children: [const Text('Toque no mapa para desenhar a área', style: TextStyle(color: Colors.white)), const SizedBox(height: 8), if (_currentPolygonPoints.length >= 3) ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.yellow, foregroundColor: Colors.black), onPressed: _finishPolygon, child: const Text('Concluir Polígono'))]))),
        ],
      ),
      
      floatingActionButton: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          FloatingActionButton(heroTag: 'locationBtn', backgroundColor: const Color(0xFF161a22), foregroundColor: Colors.white, mini: true, onPressed: _determinePosition, child: const Icon(Icons.my_location)),
          const SizedBox(height: 8),
          FloatingActionButton(heroTag: 'polyBtn', backgroundColor: _isDrawingPolygon ? Colors.yellow : const Color(0xFF161a22), foregroundColor: _isDrawingPolygon ? Colors.black : Colors.white, mini: true, onPressed: _toggleDrawingMode, child: const Icon(Icons.format_shapes)),
          const SizedBox(height: 8),
          FloatingActionButton(heroTag: 'routeBtn', backgroundColor: _isRoutingMode ? const Color(0xFF00f2fe) : const Color(0xFF161a22), foregroundColor: _isRoutingMode ? Colors.black : Colors.white, mini: true, onPressed: _toggleRoutingMode, child: const Icon(Icons.directions)),
          const SizedBox(height: 16),
          FloatingActionButton.extended(heroTag: 'trackingBtn', backgroundColor: _isTrackingRoute ? Colors.red : Colors.green, icon: Icon(_isTrackingRoute ? Icons.stop : Icons.play_arrow), label: Text(_isTrackingRoute ? 'Parar Viagem' : 'Gravar Trajeto'), onPressed: _toggleRouteTracking),
          const SizedBox(height: 12),
          FloatingActionButton(heroTag: 'incidentBtn', backgroundColor: const Color(0xFF00f2fe), foregroundColor: Colors.black, onPressed: _showAddIncidentDialog, child: const Icon(Icons.add_alert)),
        ],
      ),
    );
  }
}
