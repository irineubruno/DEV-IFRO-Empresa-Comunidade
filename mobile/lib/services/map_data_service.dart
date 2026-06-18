import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter/material.dart';

class RuralLine {
  final int id;
  final String nome;
  final String statusTrafego;
  final num indiceRisco;
  final bool pavimentada;
  final List<LatLng> coordinates;

  RuralLine({
    required this.id,
    required this.nome,
    required this.statusTrafego,
    required this.indiceRisco,
    required this.pavimentada,
    required this.coordinates,
  });

  Color get color {
    switch (statusTrafego) {
      case 'livre':
        return const Color(0xFF00e676);
      case 'atencao':
        return const Color(0xFFffea00);
      case 'bloqueado':
        return const Color(0xFFff3d00);
      default:
        return Colors.white;
    }
  }
}

class Incident {
  final String id;
  final String tipoProblema;
  final String descricao;
  final LatLng position;
  final bool resolvido;

  Incident({
    required this.id,
    required this.tipoProblema,
    required this.descricao,
    required this.position,
    required this.resolvido,
  });

  IconData get icon {
    switch (tipoProblema) {
      case 'atolamento': return Icons.directions_car;
      case 'erosao': return Icons.warning;
      case 'bueiro_danificado': return Icons.water_damage;
      case 'ponte_caida': return Icons.broken_image;
      case 'alagamento': return Icons.flood;
      case 'buraco_severo': return Icons.remove_circle_outline;
      case 'queda_arvore': return Icons.nature;
      case 'deslizamento': return Icons.landslide;
      case 'animal_na_pista': return Icons.pets;
      case 'obra_em_andamento': return Icons.construction;
      default: return Icons.error;
    }
  }

  Color get color {
    switch (tipoProblema) {
      case 'atolamento': return Colors.redAccent;
      case 'erosao': return Colors.orangeAccent;
      case 'bueiro_danificado': return Colors.brown;
      case 'ponte_caida': return Colors.red;
      case 'alagamento': return Colors.blueAccent;
      case 'buraco_severo': return Colors.orange;
      case 'queda_arvore': return Colors.green;
      case 'deslizamento': return Colors.brown;
      case 'animal_na_pista': return Colors.yellowAccent;
      case 'obra_em_andamento': return Colors.amber;
      default: return Colors.yellowAccent;
    }
  }
}

class MapDataService {
  final _client = Supabase.instance.client;

  Future<List<RuralLine>> fetchLinhasRurais() async {
    try {
      final response = await _client
          .from('linhas_rurais')
          .select('id, nome, status_trafego, indice_risco, geom, jurisdicao, pavimentada');

      final List<RuralLine> lines = [];
      for (var row in response) {
        if (row['geom'] != null && row['geom']['coordinates'] != null) {
          final coords = (row['geom']['coordinates'] as List).map((c) {
            // GeoJSON = [lng, lat]
            return LatLng(c[1].toDouble(), c[0].toDouble());
          }).toList();

          lines.add(RuralLine(
            id: row['id'] is int ? row['id'] : int.tryParse(row['id'].toString()) ?? 0,
            nome: row['nome']?.toString() ?? 'Desconhecido',
            statusTrafego: row['status_trafego']?.toString() ?? 'livre',
            indiceRisco: row['indice_risco'] ?? 0,
            pavimentada: row['pavimentada'] == true,
            coordinates: coords,
          ));
        }
      }
      return lines;
    } catch (e) {
      print('Erro ao buscar linhas rurais: $e');
      return [];
    }
  }

  Future<List<Incident>> fetchIncidentes() async {
    try {
      final response = await _client
          .from('reportes_incidentes')
          .select('id, tipo_problema, descricao, latitude, longitude, resolvido')
          .eq('resolvido', false);

      return (response as List).map((row) {
        return Incident(
          id: row['id']?.toString() ?? '',
          tipoProblema: row['tipo_problema']?.toString() ?? 'outro',
          descricao: row['descricao']?.toString() ?? '',
          position: LatLng(
            (row['latitude'] as num).toDouble(),
            (row['longitude'] as num).toDouble()
          ),
          resolvido: row['resolvido'] == true,
        );
      }).toList();
    } catch (e) {
      print('Erro ao buscar incidentes: $e');
      return [];
    }
  }

  Future<bool> updateRoadStatus(int roadId, String newStatus) async {
    try {
      await _client
          .from('linhas_rurais')
          .update({'status_trafego': newStatus})
          .eq('id', roadId);
      return true;
    } catch (e) {
      print('Erro ao atualizar status da via: $e');
      return false;
    }
  }
}
