# Country-Border-Effects-on-Forests
This repository contains the code to create the dataset used in [Public policies and global forest conservation: Empirical evidence from national borders](https://doi.org/10.1016/j.gloenvcha.2023.102770). Most of the scripts were originally written by [Devin Routh](https://devinrouth.ch/). 

The scripts are order the following way:
- "Country\_Neighbors\_Image\_Creation.js" creates the multilayer image (i.e., a layer for each country), showing land areas that are within a buffer zone of each country in the LSIB (i.e., the country neighboring areas);
- "Country\_Borders\_Custom\_Imagery.js" takes the multilayer country neighbors image and combines it with a variety of other imagery that will be used as the covariate data for the study; the output will then be a multilayer image that is clipped to the buffer zones around country borders and contains the data of interest to the PI;
- "Country\_Borders\_Custom\_Tiling.js" creates a feature collection of bounding polygons to use when parallelizing the conversion of the raster image from the previous script; this feature collection can then be looped through to export all pixels from the main image;
- "Parallelize\_Country\_Borders\_Raster\_to\_CSV.ipynb" parallelizes the conversion of the covariate / country neighbor raster into tabular format;
- "Country\_Borders\_Complete\_Wide\_to\_Long.ipynb" takes the output tables from the previous script and formats them for the PI to use within his country borders comparison tools; !! N.B., it requires the creation and placement of specific directories for temporarily holding values;
- "Country\_Borders\_Global\_Country\_Values.js" is an analysis script used to create (area weighted) country level values for the countries of interest.
