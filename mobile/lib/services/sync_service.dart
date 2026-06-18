import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'database_service.dart';

class SyncService {
  final DatabaseService _db = DatabaseService();
  final Dio _dio = Dio();
  
  // Endpoints do backend Express (Pode ser alterado para o IP local do servidor no Hackathon)
  static const String _syncEndpoint = 'https://trafegoalerta.bisn.com.br/api/v1/sync';
  static const String _areasEndpoint = 'https://trafegoalerta.bisn.com.br/api/v1/areas';
  
  SyncService() {
    // Permitir conexões HTTPS mesmo com certificados SSL autoassinados locais (apenas Mobile)
    if (!kIsWeb) {
      (_dio.httpClientAdapter as dynamic).onHttpClientCreate = (dynamic client) {
        client.badCertificateCallback = (dynamic cert, String host, int port) => true;
        return client;
      };
    }
  }

  StreamSubscription<ConnectivityResult>? _subscription;
  bool _isSyncing = false;

  // Inicializar escuta automática de internet
  void startAutoSync(String userToken) {
    _subscription = Connectivity().onConnectivityChanged.listen((ConnectivityResult result) {
      final hasConnection = result == ConnectivityResult.wifi || 
                            result == ConnectivityResult.mobile;
      
      if (hasConnection) {
        print("🌐 Conexão de internet detectada! Disparando sincronização...");
        syncOfflineData(userToken);
      }
    });
  }

  // Desinscrever-se ao deslogar/fechar app
  void stopAutoSync() {
    _subscription?.cancel();
  }

  // Executar sincronização manual ou automática
  Future<bool> syncOfflineData(String userToken) async {
    if (_isSyncing) return false;
    _isSyncing = true;

    try {
      final List<Map<String, dynamic>> incidentes = await _db.getOfflineIncidents();
      final List<Map<String, dynamic>> rotas = await _db.getOfflineRoutes();
      final List<Map<String, dynamic>> areas = await _db.getOfflineAreas();

      if (incidentes.isEmpty && rotas.isEmpty && areas.isEmpty) {
        print("💡 Nada para sincronizar. Fila local vazia.");
        _isSyncing = false;
        return true;
      }

      bool success = true;

      // Sincronizar Incidentes e Rotas em Lote
      if (incidentes.isNotEmpty || rotas.isNotEmpty) {
        print("📤 Enviando lote de sincronização para o servidor: ${incidentes.length} incidentes, ${rotas.length} rotas.");

        final payload = {
          'incidentes': incidentes,
          'rotas': rotas
        };

        final response = await _dio.post(
          _syncEndpoint,
          data: payload,
          options: Options(
            headers: {
              'Authorization': 'Bearer $userToken',
              'Content-Type': 'application/json'
            },
            validateStatus: (status) => status! < 500 // não lançar exceções para erros normais de API
          )
        );

        if (response.statusCode == 200) {
          print("✅ Sincronização em lote concluída com sucesso!");
        
          // Limpar filas locais apenas se foi salvo com sucesso
          await _db.clearOfflineIncidents();
          await _db.clearOfflineRoutes();
        } else {
          print("❌ Erro no processamento de incidentes/rotas do servidor (${response.statusCode}): ${response.data}");
          success = false;
        }
      }

      // ----------------------------------------------------------------------
      // SINCRONIZAÇÃO DE ÁREAS (Individual, pois o endpoint atual é único)
      // ----------------------------------------------------------------------
      if (areas.isNotEmpty) {
        print("📤 Enviando ${areas.length} áreas monitoradas pendentes.");
        bool allAreasSuccess = true;

        for (final area in areas) {
          try {
            final areaResponse = await _dio.post(
              _areasEndpoint,
              data: area,
              options: Options(
                headers: {
                  'Authorization': 'Bearer $userToken',
                  'Content-Type': 'application/json'
                },
                validateStatus: (status) => status! < 500
              )
            );

            if (areaResponse.statusCode != 201 && areaResponse.statusCode != 200) {
              print("❌ Erro ao enviar área (${area['nome']}): ${areaResponse.data}");
              allAreasSuccess = false;
            }
          } catch (e) {
            print("❌ Erro de rede ao enviar área (${area['nome']}): $e");
            allAreasSuccess = false;
          }
        }

        if (allAreasSuccess) {
          await _db.clearOfflineAreas();
        } else {
          success = false;
        }
      }

      _isSyncing = false;
      return success;

    } catch (e) {
      print("❌ Erro de rede ou servidor ao tentar sincronizar: $e");
      _isSyncing = false;
      return false;
    }
  }
}
