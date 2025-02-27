// Imports section
var lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017"),
	globalImage = ee.Image("users/devinrouth/ETH_Country_Borders/20191104_CountryBordersCustomLayers_Global");


// Create a histogram of the country codes included in the LSIB
var countryCodesHistogram = lsib.aggregate_histogram('country_co');
// print('Country Codes Histogram',countryCodesHistogram);

// Create a feature collection from the country codes, with null features that
// each contain a string property of the country code
var countryCodeFC = ee.FeatureCollection(ee.Dictionary(countryCodesHistogram).keys().map(function(cc) {
	return ee.Feature(null).set('CC', cc);
}));
// print('Country Codes Feature Collection',countryCodeFC);

// Create a feature collection where new geometries of all LSIB countries are created using the
// country codes
var lsibFromCountryCodes = countryCodeFC.map(function(f) {
	return ee.Feature(lsib.filterMetadata('country_co', 'equals', f.get('CC')).geometry()).set('CC', f.get('CC'));
});
// print('New LSIB Features using Country Codes',lsibFromCountryCodes.limit(5));
var exampleFeature = lsibFromCountryCodes.filterMetadata('CC', 'equals', 'US');
// print('Example Feature',exampleFeature);
// Map.addLayer(exampleFeature,{},'Example Feature',false);

Export.table.toAsset({
	collection: lsibFromCountryCodes,
	description: 'LSIB_From_Country_Codes',
	assetId: 'users/devinrouth/LSIB_From_Country_Codes'
});

// Call the LSIB that was created using only the country codes
var lsibFromCC = ee.FeatureCollection("users/devinrouth/LSIB_From_Country_Codes");
print('LSIB from Country Codes', lsibFromCC);

var lsibSample = ee.FeatureCollection(ee.Feature(lsibFromCC.first()));
// var lsibSample = lsibFromCC.limit(10);

// Input the reducer to use and the image to reduce
var reducerToUse = ee.Reducer.mean();
var imageOfInterest = globalImage;

// Make a function that maps through each band of an image and peforms
var areaWeightedReductionAcrossBands = function(regionFeature) {
	var bandNames = imageOfInterest.bandNames();
	var reducerOutputs = bandNames.map(function(bN) {
		var preppedImage = imageOfInterest.select([bN]).addBands(ee.Image.pixelArea());
		var rawResults = preppedImage.reduceRegion({
			reducer: reducerToUse.splitWeights(),
			geometry: regionFeature.geometry(),
			maxPixels: 1e13
		});
		var numResults = ee.Number(ee.Dictionary(rawResults).get('mean'));
		return [bN, numResults];
	});
	return ee.Dictionary(reducerOutputs.flatten());
};

// Apply the function to the full collection, saving the country code for each country with the processed data
var areaWeightedOutput = lsibFromCC.map(function(f) {
	return f.set(areaWeightedReductionAcrossBands(f))
});

Export.table.toAsset({
	collection: areaWeightedOutput,
	description: '20191107_Country_Weighted_Reducer_Output',
	assetId: 'users/devinrouth/ETH_Country_Borders/20191107_Country_Weighted_Reducer_Output'
});
