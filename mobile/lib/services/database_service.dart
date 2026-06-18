import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class DatabaseService {
  static const String _incidentsKey = 'offline_incidents_queue';
  static const String _routesKey = 'offline_routes_queue';

  // --------------------------------------------------------------------------
  // INCIDENTES OFFLINE
  // --------------------------------------------------------------------------

  // Salvar incidente na fila local offline
  Future<void> saveIncidentOffline(Map<String, dynamic> incident) async {
    final prefs = await SharedPreferences.getInstance();
    final List<String> currentList = prefs.getStringList(_incidentsKey) ?? [];
    
    currentList.add(jsonEncode(incident));
    await prefs.setStringList(_incidentsKey, currentList);
    print("💾 Incidente salvo localmente na fila offline. Total: ${currentList.length}");
  }

  // Obter lista de incidentes offline
  Future<List<Map<String, dynamic>>> getOfflineIncidents() async {
    final prefs = await SharedPreferences.getInstance();
    final List<String> currentList = prefs.getStringList(_incidentsKey) ?? [];
    
    return currentList
        .map((item) => jsonDecode(item) as Map<String, dynamic>)
        .toList();
  }

  // Limpar fila de incidentes offline após sincronização de sucesso
  Future<void> clearOfflineIncidents() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_incidentsKey);
    print("🧹 Fila de incidentes offline limpa.");
  }

  // --------------------------------------------------------------------------
  // ROTAS OFFLINE
  // --------------------------------------------------------------------------

  // Salvar rota/tracking na fila local offline
  Future<void> saveRouteOffline(Map<String, dynamic> route) async {
    final prefs = await SharedPreferences.getInstance();
    final List<String> currentList = prefs.getStringList(_routesKey) ?? [];
    
    currentList.add(jsonEncode(route));
    await prefs.setStringList(_routesKey, currentList);
    print("💾 Rota salva localmente na fila offline. Total: ${currentList.length}");
  }

  // Obter lista de rotas offline
  Future<List<Map<String, dynamic>>> getOfflineRoutes() async {
    final prefs = await SharedPreferences.getInstance();
    final List<String> currentList = prefs.getStringList(_routesKey) ?? [];
    
    return currentList
        .map((item) => jsonDecode(item) as Map<String, dynamic>)
        .toList();
  }

  // Limpar fila de rotas offline após sincronização de sucesso
  Future<void> clearOfflineRoutes() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_routesKey);
    print("🧹 Fila de rotas offline limpa.");
  }

  // --------------------------------------------------------------------------
  // ÁREAS MONITORADAS (POLÍGONOS) OFFLINE
  // --------------------------------------------------------------------------
  static const String _areasKey = 'offline_areas_queue';

  Future<void> saveAreaOffline(Map<String, dynamic> area) async {
    final prefs = await SharedPreferences.getInstance();
    final List<String> currentList = prefs.getStringList(_areasKey) ?? [];
    
    currentList.add(jsonEncode(area));
    await prefs.setStringList(_areasKey, currentList);
    print("💾 Área salva localmente na fila offline. Total: ${currentList.length}");
  }

  Future<List<Map<String, dynamic>>> getOfflineAreas() async {
    final prefs = await SharedPreferences.getInstance();
    final List<String> currentList = prefs.getStringList(_areasKey) ?? [];
    
    return currentList
        .map((item) => jsonDecode(item) as Map<String, dynamic>)
        .toList();
  }

  Future<void> clearOfflineAreas() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_areasKey);
    print("🧹 Fila de áreas offline limpa.");
  }
}
