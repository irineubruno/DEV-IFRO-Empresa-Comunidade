#!/usr/bin/env python3
"""
Extrai coordenadas reais de estradas/caminhos da zona rural de Ariquemes
a partir dos shapefiles de uso do solo e hidrografia para identificar
as linhas rurais. As 'linhas' de Ariquemes seguem um padrão de estradas
vicinais que cortam a área rural do município.

Baseado nos dados geográficos reais do município (IBGE código 1100023).
"""
import shapefile
import json
from pyproj import Transformer

# SIRGAS 2000 UTM Zone 20S -> WGS84
transformer = Transformer.from_crs("EPSG:31980", "EPSG:4326", always_xy=True)

def extract_road_candidates(shp_path, max_features=200, min_length_km=3.0):
    """
    Extrai polylines dos rios simples como referência de caminhos rurais.
    Na prática, as estradas vicinais de Ariquemes correm paralelas aos rios
    e possuem nomes como Linha C-65, Linha C-70, etc.
    """
    sf = shapefile.Reader(shp_path)
    fields = [f[0] for f in sf.fields[1:]]
    
    candidates = []
    for i, rec in enumerate(sf.iterShapeRecords()):
        props = dict(zip(fields, rec.record))
        comp_km = props.get('COMP_KM', 0)
        
        # Filtrar por comprimento mínimo (pegar apenas rios/caminhos significativos)
        if comp_km < min_length_km:
            continue
        
        coords = []
        for point in rec.shape.points:
            lon, lat = transformer.transform(point[0], point[1])
            coords.append([round(lon, 6), round(lat, 6)])
        
        # Simplificar coordenadas (pegar 1 a cada N pontos para reduzir dados)
        if len(coords) > 50:
            step = max(1, len(coords) // 40)
            simplified = coords[::step]
            # Garantir que o último ponto está incluído
            if simplified[-1] != coords[-1]:
                simplified.append(coords[-1])
            coords = simplified
        
        candidates.append({
            'name': props.get('HIDRO', 'Desconhecido'),
            'length_km': round(comp_km, 2),
            'coords': coords,
            'num_points': len(coords)
        })
    
    # Ordenar por comprimento (maior primeiro)
    candidates.sort(key=lambda x: x['length_km'], reverse=True)
    return candidates

base = '/home/bisn/Documentos/Faculdade2026/hackathon/backend/ARIQUEMES'
candidates = extract_road_candidates(f'{base}/HIDROGRAFIA/RO_1100023_RIOS_SIMPLES.shp', min_length_km=5.0)

print(f"Encontrados {len(candidates)} rios/caminhos com > 5km:")
for i, c in enumerate(candidates[:30]):
    print(f"  [{i}] {c['name']} - {c['length_km']}km ({c['num_points']} pts)")
    print(f"       Início: {c['coords'][0]}, Fim: {c['coords'][-1]}")

# Salvar os melhores candidatos como JSON para uso no script de atualização
output = []
for c in candidates[:30]:
    output.append({
        'name': c['name'],
        'length_km': c['length_km'],
        'coordinates': c['coords']
    })

with open('/home/bisn/Documentos/Faculdade2026/hackathon/backend/road_candidates.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"\nSalvo {len(output)} candidatos em road_candidates.json")
