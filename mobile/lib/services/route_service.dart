import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

/// Resultado de uma rota calculada
class RouteResult {
  final List<LatLng> coordinates;
  final double distanceKm;
  final int durationMinutes;
  final String distanceText;
  final String durationText;

  RouteResult({
    required this.coordinates,
    required this.distanceKm,
    required this.durationMinutes,
    required this.distanceText,
    required this.durationText,
  });
}

class RouteService {
  static const String _osrmBaseUrl = 'https://router.project-osrm.org';

  /// Calcula rota de carro entre dois pontos usando OSRM
  static Future<RouteResult?> calculateRoute(LatLng origin, LatLng destination) async {
    try {
      final url = Uri.parse(
        '$_osrmBaseUrl/route/v1/driving/'
        '${origin.longitude},${origin.latitude};'
        '${destination.longitude},${destination.latitude}'
        '?overview=full&geometries=geojson'
      );

      final response = await http.get(url).timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        print('❌ OSRM retornou status ${response.statusCode}');
        return null;
      }

      final data = jsonDecode(response.body);

      if (data['routes'] == null || (data['routes'] as List).isEmpty) {
        print('❌ Nenhuma rota encontrada pelo OSRM');
        return null;
      }

      final route = data['routes'][0];

      // Converter coordenadas GeoJSON [lon, lat] para LatLng
      final List<LatLng> coords = (route['geometry']['coordinates'] as List)
          .map<LatLng>((c) => LatLng(c[1].toDouble(), c[0].toDouble()))
          .toList();

      final double distanceMeters = (route['distance'] as num).toDouble();
      final double durationSeconds = (route['duration'] as num).toDouble();

      final double distanceKm = distanceMeters / 1000;
      final int durationMin = (durationSeconds / 60).round();

      // Formatar textos
      final String distanceText = distanceKm >= 100
          ? '${distanceKm.toStringAsFixed(0)} km'
          : '${distanceKm.toStringAsFixed(1)} km';

      String durationText;
      if (durationMin >= 60) {
        final hours = durationMin ~/ 60;
        final mins = durationMin % 60;
        durationText = '${hours}h ${mins}min';
      } else {
        durationText = '$durationMin min';
      }

      return RouteResult(
        coordinates: coords,
        distanceKm: distanceKm,
        durationMinutes: durationMin,
        distanceText: distanceText,
        durationText: durationText,
      );
    } catch (e) {
      print('❌ Erro ao calcular rota OSRM: $e');
      return null;
    }
  }
}
