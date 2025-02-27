// Imports section
var bordersImage = ee.Image("users/devinrouth/ETH_Country_Borders/20191210_CountryBordersCustomLayers_BordersOnly_EqualArea");


// Finalize the image you'd like to tile
var maskToUse = bordersImage.select('DistanceInKM').gt(-999);
var finalImage = bordersImage;
print('Final Image', finalImage);
Map.addLayer(finalImage, {}, 'Final Image', false);


// Make random fields using an input resolution / CRS of your choice
// !! The first random field will not have edge pixels, due to the masking
// !! the second random field will specifically be for the edge pixels
var reprojectOptions = {
	crs: 'EPSG:4326',
	crsTransform: [2, 0, -180, 0, -2, 90]
};
var randomImage = ee.Image.random(42).reproject(reprojectOptions);
var randomImageSansEdges = randomImage.updateMask(maskToUse)
	.reproject(reprojectOptions)
	.multiply(1e16).int64();
Map.addLayer(randomImage, {}, 'Complete Random Image', false);
Map.addLayer(randomImageSansEdges, {}, 'Random Image Sans Edges', false);

var randomImageEdges = ee.Image.random(42).reproject(reprojectOptions)
	.updateMask(randomImageSansEdges.unmask(0).eq(0).selfMask())
	.multiply(1e16).int64();
Map.addLayer(randomImageEdges, {}, 'Random Image of Edges', false);


// Convert the random fields to feature collections
var unboundedGeo = ee.Geometry.Polygon([-180, 88, 0, 88, 180, 88, 180, -88, 0, -88, -180, -88], null, false);
// var unboundedGeo = ee.Geometry.Rectangle([-180, -90, 180, 90], "EPSG:4326", false);
var vectorsWithoutEdges = randomImageSansEdges.reduceToVectors({
	maxPixels: 1e13,
	geometry: unboundedGeo
});
print('vectorsWithoutEdges size', vectorsWithoutEdges.size());
print('vectorsWithoutEdges sample', vectorsWithoutEdges.limit(5));
Map.addLayer(vectorsWithoutEdges, {}, 'vectorsWithoutEdges', false);
var vectorsEdges = randomImageEdges.reduceToVectors({
	maxPixels: 1e13,
	geometry: unboundedGeo
});
print('vectorsEdges size', vectorsEdges.size());
print('vectorsEdges sample', vectorsEdges.limit(5));
Map.addLayer(vectorsEdges, {}, 'vectorsEdges', false);


// Map through each of the edge features and remove any of them containing 0 pixels
// !! First, reduce the image bands to show the number of non-null values for each pixel
var filteredVectorEdges = finalImage.abs().reduce('sum').reduceRegions({
	collection: vectorsEdges,
	reducer: 'sum',
	tileScale: 16
}).filterMetadata('sum', 'not_equals', 0);
// print('Filtered Edges FC Size',filteredVectorEdges.size());
// print('Filtered Edges FC',filteredVectorEdges.limit(5));
Map.addLayer(filteredVectorEdges, {}, 'filteredVectorEdges', false);


// Merge then export the full feature collection of vectors containing pixels
var finalFC = vectorsWithoutEdges.merge(filteredVectorEdges);
Export.table.toAsset({
	collection: finalFC,
	description: '20191217_Tiles_for_Country_Borders_Export',
	assetId: 'users/devinrouth/ETH_Country_Borders/20191217_Tiles_for_Country_Borders_Export'
});

// Finalize the export
var fullVectors = ee.FeatureCollection('users/devinrouth/ETH_Country_Borders/20191217_Tiles_for_Country_Borders_Export');
Map.addLayer(fullVectors, {}, 'Final Vectors', false);
print('Final FC Size', fullVectors.size());
print('Final FC', fullVectors.limit(5));
// var sample = fullVectors.filterMetadata('label','equals',1325544992028648);
// Map.centerObject(sample);
// Map.addLayer(sample,{},'Sample Vector Feature',false);
// Map.addLayer(finalImage.select('Abs_Lat').gt(-100),{},'Reduced Image - Count',false);
