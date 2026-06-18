#!/usr/bin/env python3
"""
Extract road/line data from Ariquemes shapefiles and convert UTM coordinates to WGS84.
Generates GeoJSON data for use in the dashboard.
"""
import shapefile
import json
from pyproj import Transformer

# SIRGAS 2000 UTM Zone 20S -> WGS84
transformer = Transformer.from_crs("EPSG:31980", "EPSG:4326", always_xy=True)

def extract_shapefile_info(shp_path, label):
    """Extract basic info and first few records from a shapefile."""
    sf = shapefile.Reader(shp_path)
    print(f"\n=== {label} ===")
    print(f"Shape Type: {sf.shapeTypeName}")
    print(f"Number of Records: {len(sf)}")
    print(f"Fields: {[f[0] for f in sf.fields[1:]]}")
    
    # Show first 3 records
    for i, rec in enumerate(sf.iterShapeRecords()):
        if i >= 3:
            break
        # Get bounds
        bbox = rec.shape.bbox
        # Convert bbox corners to WGS84
        lon1, lat1 = transformer.transform(bbox[0], bbox[1])
        lon2, lat2 = transformer.transform(bbox[2], bbox[3])
        print(f"  Record {i}: Fields={dict(zip([f[0] for f in sf.fields[1:]], rec.record))}")
        print(f"    BBox (WGS84): ({lat1:.6f}, {lon1:.6f}) to ({lat2:.6f}, {lon2:.6f})")
        print(f"    Num points: {len(rec.shape.points)}")

def extract_rios_simples_as_roads(shp_path, output_path, max_features=20):
    """
    Extract rios simples (simple rivers) as GeoJSON lines to use as road approximations.
    These lines represent the main waterways which are close to the rural roads (linhas).
    """
    sf = shapefile.Reader(shp_path)
    features = []
    fields = [f[0] for f in sf.fields[1:]]
    
    for i, rec in enumerate(sf.iterShapeRecords()):
        if i >= max_features:
            break
            
        coords = []
        for point in rec.shape.points:
            lon, lat = transformer.transform(point[0], point[1])
            coords.append([lon, lat])
        
        props = dict(zip(fields, rec.record))
        feature = {
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            }
        }
        features.append(feature)
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f)
    
    print(f"\nExported {len(features)} features to {output_path}")

def extract_overall_bounds(shp_paths):
    """Get overall bounding box of all shapefiles in WGS84."""
    min_lat, min_lon = 90, 180
    max_lat, max_lon = -90, -180
    
    for path in shp_paths:
        sf = shapefile.Reader(path)
        bbox = sf.bbox
        lon1, lat1 = transformer.transform(bbox[0], bbox[1])
        lon2, lat2 = transformer.transform(bbox[2], bbox[3])
        min_lat = min(min_lat, lat1, lat2)
        min_lon = min(min_lon, lon1, lon2)
        max_lat = max(max_lat, lat1, lat2)
        max_lon = max(max_lon, lon1, lon2)
    
    print(f"\nOverall bounds (WGS84):")
    print(f"  Latitude:  {min_lat:.6f} to {max_lat:.6f}")
    print(f"  Longitude: {min_lon:.6f} to {max_lon:.6f}")
    print(f"  Center:    {(min_lat+max_lat)/2:.6f}, {(min_lon+max_lon)/2:.6f}")

if __name__ == '__main__':
    base = '/home/bisn/Documentos/Faculdade2026/hackathon/backend/ARIQUEMES'
    
    shp_files = {
        'APP': f'{base}/APP/RO_1100023_APP.shp',
        'RIOS_SIMPLES': f'{base}/HIDROGRAFIA/RO_1100023_RIOS_SIMPLES.shp',
        'RIOS_DUPLOS': f'{base}/HIDROGRAFIA/RO_1100023_RIOS_DUPLOS.shp',
        'MASSAS_DAGUA': f'{base}/HIDROGRAFIA/RO_1100023_MASSAS_DAGUA.shp',
        'NASCENTES': f'{base}/HIDROGRAFIA/RO_1100023_NASCENTES.shp',
        'USO': f'{base}/USO/RO_1100023_USO.shp',
    }
    
    # Show info for all shapefiles
    for label, path in shp_files.items():
        try:
            extract_shapefile_info(path, label)
        except Exception as e:
            print(f"Error reading {label}: {e}")
    
    # Overall bounds
    extract_overall_bounds(list(shp_files.values()))
    
    # Extract rios simples as sample road-like features
    extract_rios_simples_as_roads(
        shp_files['RIOS_SIMPLES'],
        f'{base}/../public/ariquemes_hidrografia.geojson',
        max_features=50
    )
