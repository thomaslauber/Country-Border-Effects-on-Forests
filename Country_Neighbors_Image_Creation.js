// Imports section
var bordersBuffered = ee.FeatureCollection("users/devinrouth/ETH_Country_Borders/Country_Borders_100kmBuffer"),
	lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017"),
	clipTest = ee.Image("users/devinrouth/ETH_Country_Borders/Country_Neighbors_100km_clipTest");

// Filter out only the countries that physically border other countries
var borderFeature = ee.Feature(bordersBuffered.first());
var filteredLSIB = lsib.filterBounds(borderFeature.geometry());


// Union all geometries with the same country code then add a numeric value 
// to each feature
var countryCodesList = ee.Dictionary(filteredLSIB.aggregate_histogram('country_co')).keys();
var countryCodesFC = ee.FeatureCollection(countryCodesList.map(function(cc) {
	return ee.Feature(null).set('CC', cc)
}));
// print(countryCodesFC);
var preppedLSIB = countryCodesFC.map(function(f) {
	return ee.Feature(filteredLSIB.filterMetadata('country_co', 'equals', ee.String(f.get('CC'))).union().first()).set('country_co', ee.String(f.get('CC')));
});
var labelledLSIB = preppedLSIB.map(function(f) {
	return f.set('ReduceValue', 1)
});
// print(labelledLSIB);


// Buffer every country and convert the buffered country into an image
var bufferedImageCollection = ee.ImageCollection(labelledLSIB.map(function(f) {
	var bufferedFeature = f.buffer(100000);
	var differenceFeatureColl = ee.FeatureCollection(bufferedFeature.difference(f));
	var imageToReturn = differenceFeatureColl.reduceToImage(['ReduceValue'], 'first')
		.rename(ee.String('Neighbor_')
			.cat(ee.String(f.get('country_co'))))
		.clip(differenceFeatureColl).unmask(0);
	return imageToReturn;
}));

// Create an empty image to fill
var emptyImage = ee.Image([]);

// Iterate through the collection to make the new multiband image
var multibandImage = ee.Image(bufferedImageCollection.iterate(function(image, result) {
	return ee.Image(result).addBands(image);
}, emptyImage));
// print(multibandImage);
// Map.addLayer(multibandImage,{},'MI',false);


var unboundedGeo = ee.Geometry.Polygon([-180, 88, 0, 88, 180, 88, 180, -88, 0, -88, -180, -88], null, false);
Export.image.toAsset({
	image: multibandImage.toByte(),
	description: 'Country_Neighbors_100km_clipTest',
	assetId: 'users/devinrouth/ETH_Country_Borders/Country_Neighbors_100km_clipTest',
	region: unboundedGeo,
	crs: 'EPSG:4326',
	crsTransform: [0.008333333333333333, 0, -180, 0, -0.008333333333333333, 90],
	maxPixels: 1e13,
	pyramidingPolicy: {
		".default": "mode"
	}
});


// After the processing is complete, add the image to the map to display the country border areas
var finishedImage = ee.Image('users/devinrouth/ETH_Country_Borders/Country_Neighbors_100km');
print('Finished Country Neighbors Image', finishedImage);
var selectedBand = 'Neighbor_SW';
Map.addLayer(finishedImage.select(selectedBand).selfMask(), {
	min: 0,
	max: 1,
	palette: ['FF0000']
}, 'Country Neighbors - Selected Band', false);

var selectedCountryOI = 'Sweden';
var lsibFOI = ee.Feature(lsib.filterMetadata('country_na', 'equals', selectedCountryOI).first());
var lsibFOIBuffered = lsibFOI.buffer(100000);
var differenceFeature = lsibFOIBuffered.difference(lsibFOI);
Map.addLayer(lsibFOI, {}, 'LSIB Feature Of Interest', false);
Map.addLayer(differenceFeature, {}, 'Difference Feature Of Interest', false);

// Check on the instance of a pixel wherein the country of origin is also listed as a neighbor
var pointOI = ee.Geometry.Point([11.529166, 57.995834]);
Map.addLayer(pointOI, {}, 'Point of Interest');
Map.centerObject(pointOI, 14);



// Check the clipped version of the code outputs
Map.addLayer(clipTest.select(selectedBand).selfMask(), {
	min: 0,
	max: 1,
	palette: ['00FF00']
}, 'Clip Test', false);
