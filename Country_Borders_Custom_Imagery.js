// Imports Section
var terraVeg = ee.ImageCollection("MODIS/006/MOD13A2"),
	aquaVeg = ee.ImageCollection("MODIS/006/MYD13A2"),
	terraNppGpp = ee.ImageCollection("MODIS/055/MOD17A3"),
	countryBorders = ee.FeatureCollection("users/devinrouth/ETH_Country_Borders/CountryBorders"),
	countryBordersBuffered = ee.FeatureCollection("users/devinrouth/ETH_Country_Borders/Country_Borders_100kmBuffer"),
	hansenForestCoverCurrent = ee.Image("UMD/hansen/global_forest_change_2018_v1_6"),
	countryNeighbors = ee.Image("users/devinrouth/ETH_Country_Borders/Country_Neighbors_100km"),
	hansen2012 = ee.Image("UMD/hansen/global_forest_change_2013"),
	hansen2013 = ee.Image("UMD/hansen/global_forest_change_2014"),
	hansen2014 = ee.Image("UMD/hansen/global_forest_change_2015"),
	hansen2015 = ee.Image("UMD/hansen/global_forest_change_2015_v1_3"),
	hansen2016 = ee.Image("UMD/hansen/global_forest_change_2016_v1_4"),
	hansen2017 = ee.Image("UMD/hansen/global_forest_change_2017_v1_5"),
	forestRestorationColl = ee.ImageCollection("users/devinrouth/Forest_Restoration_Potential_Layers"),
	consensusLandCoverImage = ee.Image("users/devinrouth/Consensus_Land_Cover_30ArcSec");


// Combine Aqua and Terra data for the NDVI and EVI image creation
// !! The composite is created by averaging all data values across the entire range of available data
// !! from February 2000 to the end of 2018
var modisVegImageToFilter = terraVeg.merge(aquaVeg);
var yearIC_NDVIEVI = ee.ImageCollection(ee.List.sequence(2000, 2018, 1).map(function(y) {
	return ee.Image(0).set('Year', y)
}));
var threeYearNDVIEVI_IC = yearIC_NDVIEVI.map(function(i) {
	var startDate = ee.Date.fromYMD(ee.Number(i.get('Year')), 01, 01);
	var endDate = ee.Date.fromYMD(ee.Number(i.get('Year')).add(3), 12, 31);
	var ndviBandName_Mean = ee.String('Mean_NDVI_').cat(ee.String(ee.Number(i.get('Year')).toInt()));
	var eviBandName_Mean = ee.String('Mean_EVI_').cat(ee.String(ee.Number(i.get('Year')).toInt()));
	var ndviBandName_Median = ee.String('Median_NDVI_').cat(ee.String(ee.Number(i.get('Year')).toInt()));
	var eviBandName_Median = ee.String('Median_EVI_').cat(ee.String(ee.Number(i.get('Year')).toInt()));
	var imageToReturn_Mean = modisVegImageToFilter.filterDate(startDate, endDate).select(['NDVI', 'EVI'], [ndviBandName_Mean, eviBandName_Mean]).mean();
	var imageToReturn_Median = modisVegImageToFilter.filterDate(startDate, endDate).select(['NDVI', 'EVI'], [ndviBandName_Median, eviBandName_Median]).median();
	return ee.Image.cat(imageToReturn_Mean, imageToReturn_Median);
});
// Create an empty image to fill then iterate through the collection to make the new multiband image
var emptyImage_NDVIEVI = ee.Image([]);
var multibandImage_NDVIEVI = ee.Image(threeYearNDVIEVI_IC.iterate(function(image, result) {
	return ee.Image(result).addBands(image);
}, emptyImage_NDVIEVI));
print('Final NDVI/EVI Images', multibandImage_NDVIEVI);



// Produce NPP and GPP estimates for as many years as available
var modisNPP = terraNppGpp.map(function(i) {
	return i.float()
});
var modisGPP = terraNppGpp;
var yearIC_NPPGPP = ee.ImageCollection(ee.List.sequence(2000, 2012, 2).map(function(y) {
	return ee.Image(0).set('Year', y)
}));
var threeYearNPP_IC = yearIC_NPPGPP.map(function(i) {
	var startDate = ee.Date.fromYMD(ee.Number(i.get('Year')), 01, 01);
	var endDate = ee.Date.fromYMD(ee.Number(i.get('Year')).add(2), 12, 31);
	var nppBandName = ee.String('Mean_NPP_').cat(ee.String(ee.Number(i.get('Year')).toInt())).cat('_to_').cat(ee.String(ee.Number(i.get('Year')).add(2).toInt()));
	var imageToReturn = modisNPP.filterDate(startDate, endDate).select(['Npp'], [nppBandName]).mean();
	return imageToReturn;
});
var threeYearGPP_IC = yearIC_NPPGPP.map(function(i) {
	var startDate = ee.Date.fromYMD(ee.Number(i.get('Year')), 01, 01);
	var endDate = ee.Date.fromYMD(ee.Number(i.get('Year')).add(2), 12, 31);
	var gppBandName = ee.String('Mean_GPP_').cat(ee.String(ee.Number(i.get('Year')).toInt())).cat('_to_').cat(ee.String(ee.Number(i.get('Year')).add(2).toInt()));
	var imageToReturn = modisGPP.filterDate(startDate, endDate).select(['Gpp'], [gppBandName]).mean();
	return imageToReturn;
});
// Create an empty image to fill then iterate through the collection to make the new multiband image
// !! Adding an .unmask(0) fills all previously NA areas missing NPP/GPP data with 0's
var emptyImage_NPP = ee.Image([]);
var multibandImage_NPP = ee.Image(threeYearNPP_IC.iterate(function(image, result) {
	return ee.Image(result).addBands(image);
}, emptyImage_NPP)).unmask(0);
print('Final NPP', multibandImage_NPP);

var emptyImage_GPP = ee.Image([]);
var multibandImage_GPP = ee.Image(threeYearGPP_IC.iterate(function(image, result) {
	return ee.Image(result).addBands(image);
}, emptyImage_GPP)).unmask(0);
print('FinalGPP', multibandImage_GPP);




// Produce a distance to border layer
var countryBordersMask = ee.Image().toByte().paint(countryBorders, 1);
var distanceInKM_FDT = countryBordersMask
	.fastDistanceTransform(5000).sqrt()
	.multiply(ee.Image.pixelArea().sqrt())
	.divide(1000).rename('DistanceInKM');




// Produce a total forest loss layer and additional layers for every year that loss was recorded
var produceHansenLoss = function(hansenImage) {
	var forestLoss = hansenImage.select('lossyear').eq(ee.Image.constant(ee.Number(hansenImage.get('Year')))).reduceResolution({
		reducer: 'mean',
		maxPixels: 65536
	});
	return forestLoss;
};

var forestLoss_2001 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 1)).rename('Hansen_ForestLoss_2001');
var forestLoss_2002 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 2)).rename('Hansen_ForestLoss_2002');
var forestLoss_2003 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 3)).rename('Hansen_ForestLoss_2003');
var forestLoss_2004 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 4)).rename('Hansen_ForestLoss_2004');
var forestLoss_2005 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 5)).rename('Hansen_ForestLoss_2005');
var forestLoss_2006 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 6)).rename('Hansen_ForestLoss_2006');
var forestLoss_2007 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 7)).rename('Hansen_ForestLoss_2007');
var forestLoss_2008 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 8)).rename('Hansen_ForestLoss_2008');
var forestLoss_2009 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 9)).rename('Hansen_ForestLoss_2009');
var forestLoss_2010 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 10)).rename('Hansen_ForestLoss_2010');
var forestLoss_2011 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 11)).rename('Hansen_ForestLoss_2011');
var forestLoss_2012 = produceHansenLoss(hansen2012.set('Year', 12)).rename('Hansen_ForestLoss_2012');
var forestLoss_2013 = produceHansenLoss(hansen2013.set('Year', 13)).rename('Hansen_ForestLoss_2013');
var forestLoss_2014 = produceHansenLoss(hansen2014.set('Year', 14)).rename('Hansen_ForestLoss_2014');
var forestLoss_2015 = produceHansenLoss(hansen2015.set('Year', 15)).rename('Hansen_ForestLoss_2015');
var forestLoss_2016 = produceHansenLoss(hansen2016.set('Year', 16)).rename('Hansen_ForestLoss_2016');
var forestLoss_2017 = produceHansenLoss(hansen2017.set('Year', 17)).rename('Hansen_ForestLoss_2017');
var forestLoss_2018 = produceHansenLoss(hansenForestCoverCurrent.set('Year', 18)).rename('Hansen_ForestLoss_2018');
var forestLossCat = ee.Image.cat(forestLoss_2001, forestLoss_2002, forestLoss_2003, forestLoss_2004, forestLoss_2005,
	forestLoss_2006, forestLoss_2007, forestLoss_2008, forestLoss_2009, forestLoss_2010,
	forestLoss_2011, forestLoss_2012, forestLoss_2013, forestLoss_2014, forestLoss_2015,
	forestLoss_2016, forestLoss_2017, forestLoss_2018);
print('Hansen Forest Loss 2012 - 2018', forestLossCat);

var totalForestLoss = hansenForestCoverCurrent.select('loss').rename('Hansen_ForestLoss_Total').reduceResolution({
	reducer: 'mean',
	maxPixels: 65536
});
print('Hansen Total Forest Loss', totalForestLoss);




// Produce a current forest cover layer and additional layers for every year that gain/loss was recorded
var produceHansenExtent = function(hansenImage) {
	var forestFrom2000 = hansenImage.select('treecover2000').gte(10).and(hansenImage.select('loss').neq(1));
	var forestSince2000 = hansenImage.select('gain').eq(1);
	var totalForestExtent = forestFrom2000.add(forestSince2000).gte(1);
	var totalForestExtentToReturn = totalForestExtent.reduceResolution({
		reducer: 'mean',
		maxPixels: 65536
	});
	return totalForestExtentToReturn;
};

var forestExtent_2012 = produceHansenExtent(hansen2012).rename('Hansen_ForestCover_2012');
var forestExtent_2013 = produceHansenExtent(hansen2013).rename('Hansen_ForestCover_2013');
var forestExtent_2014 = produceHansenExtent(hansen2014).rename('Hansen_ForestCover_2014');
var forestExtent_2015 = produceHansenExtent(hansen2015).rename('Hansen_ForestCover_2015');
var forestExtent_2016 = produceHansenExtent(hansen2016).rename('Hansen_ForestCover_2016');
var forestExtent_2017 = produceHansenExtent(hansen2017).rename('Hansen_ForestCover_2017');
var forestExtent_2018 = produceHansenExtent(hansenForestCoverCurrent).rename('Hansen_ForestCover_2018');
var forestExtentCat = ee.Image.cat(forestExtent_2012, forestExtent_2013, forestExtent_2014, forestExtent_2015,
	forestExtent_2016, forestExtent_2017, forestExtent_2018);
print('Hansen Forest Cover 2001 - 2018', forestExtentCat);




// Add in JF's potential forest cover layer
var forestRestorationImage = forestRestorationColl.toBands().select(['Restoration_potential_b1', 'Total_potential_classification'], ['Forest_Resto_Potential', 'Forest_Total_Potential']);
var forestRestorationPotential = forestRestorationImage.select('Forest_Resto_Potential').unmask(0);
var forestRestorationTotal = forestRestorationImage.select('Forest_Total_Potential');
print('Potential Forest Restoration', forestRestorationPotential);
print('Potential Forest Cover', forestRestorationTotal);




// Add in the consensus land cover data, with prefixes for the bands before adding them to the composite
var updatedLandCoverBandNames = consensusLandCoverImage.bandNames().map(function(s) {
	return ee.String('LandCoverClass_').cat(ee.String(s))
});
var landCoverConsensusImage = consensusLandCoverImage.select(consensusLandCoverImage.bandNames(), updatedLandCoverBandNames);
// print('landCoverConsensusImage',landCoverConsensusImage);




// Produce an equal area projection from a WKT string
// https://epsg.io/6933#
var wkt = 'PROJCS["unnamed", \
    GEOGCS["WGS 84", \
        DATUM["WGS_1984", \
            SPHEROID["WGS 84",6378137,298.257223563, \
                AUTHORITY["EPSG","7030"]], \
            TOWGS84[0,0,0,0,0,0,0], \
            AUTHORITY["EPSG","6326"]], \
        PRIMEM["Greenwich",0, \
            AUTHORITY["EPSG","8901"]], \
        UNIT["degree",0.0174532925199433, \
            AUTHORITY["EPSG","9108"]], \
        AUTHORITY["EPSG","4326"]], \
    PROJECTION["Cylindrical_Equal_Area"], \
    PARAMETER["standard_parallel_1",30], \
    PARAMETER["central_meridian",0], \
    PARAMETER["false_easting",0], \
    PARAMETER["false_northing",0], \
    UNIT["Meter",1], \
    AUTHORITY["epsg","6933"]]';
var equalAreaProjGlobe = ee.Projection(wkt).atScale(1000);
// print(equalAreaProjGlobe);




// Concatenate all of the images into a single image
// !! The current version of the code is clipped to the Country Borders buffer
// !! Another version of the composite was created for the entire world (without the distance layer)
// !! See the asset: 
var finalComposite_BordersOnly = ee.Image.cat(multibandImage_NDVIEVI,
		multibandImage_NPP,
		multibandImage_GPP,
		distanceInKM_FDT,
		forestLossCat,
		totalForestLoss,
		forestExtentCat,
		forestRestorationPotential,
		forestRestorationTotal,
		landCoverConsensusImage).double()
	.clip(countryBordersBuffered)
	.updateMask(forestRestorationTotal.add(1000));
print('Final Composite - Borders Only', finalComposite_BordersOnly);
Map.addLayer(finalComposite_BordersOnly, {}, 'Final Composite - Borders Only', false);

var finalComposite_Global = ee.Image.cat(multibandImage_NDVIEVI,
		multibandImage_NPP,
		multibandImage_GPP,
		forestLossCat,
		totalForestLoss,
		forestExtentCat,
		forestRestorationPotential,
		forestRestorationTotal,
		landCoverConsensusImage).double()
	.updateMask(forestRestorationTotal.add(1000));
print('Final Composite - Global', finalComposite_Global);
Map.addLayer(finalComposite_Global, {}, 'Final Composite - Global', false);




// Export the images of interest, first as WGS84 then as an equal area image
var unboundedGeo = ee.Geometry.Polygon([-180, 88, 0, 88, 180, 88, 180, -88, 0, -88, -180, -88], null, false);

Export.image.toAsset({
	image: finalComposite_BordersOnly,
	description: '20191207_CountryBordersCustomLayers_BordersOnly',
	assetId: 'users/devinrouth/ETH_Country_Borders/20191207_CountryBordersCustomLayers_BordersOnly',
	region: unboundedGeo,
	crs: 'EPSG:4326',
	crsTransform: [0.008333333333333333, 0, -180, 0, -0.008333333333333333, 90],
	maxPixels: 1e13
});

var wgs84Image = ee.Image('users/devinrouth/ETH_Country_Borders/20191207_CountryBordersCustomLayers_BordersOnly');
print('wgs84Image', wgs84Image);

Export.image.toAsset({
	image: wgs84Image.reproject(equalAreaProjGlobe),
	description: '20191210_CountryBordersCustomLayers_BordersOnly_EqualArea',
	assetId: 'users/devinrouth/ETH_Country_Borders/20191210_CountryBordersCustomLayers_BordersOnly_EqualArea',
	region: unboundedGeo,
	scale: 1000,
	maxPixels: 1e13
});


// Make global image exports for country-wide statistics

// var imageName_Global = '20191104_CountryBordersCustomLayers_Global';
// Export.image.toAsset({
// 	image: finalComposite_Global,
// 	description: imageName_Global,
// 	assetId: 'users/devinrouth/ETH_Country_Borders/' + imageName_Global,
// 	region: unboundedGeo,
// 	scale: 1000,
// 	maxPixels: 1e13
// });


// // Examine the output of the export
// var exportPath = 'users/devinrouth/ETH_Country_Borders/'+imageName;
// var imageToExamine = ee.Image(exportPath).updateMask(ee.Image(exportPath).select('Hansen_ForestLoss_2018').add(1000));
