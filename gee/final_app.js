// ============================================================
// Cool Refuge London — Integrated App  v3
// Fixes:
//   - Module 1 no longer shows coolspace points on first load
//   - Module 3 pie chart restored (async-safe bootstrap)
//   - Nav bar inactive buttons: solid readable colour (#2a5a7a)
// ============================================================

// ============================================================
// 0. GLOBAL ASSETS
// ============================================================
var london       = ee.FeatureCollection('projects/still-cipher-492419-m3/assets/London_GLA_Boundary');
var lsoa         = ee.FeatureCollection('projects/still-cipher-492419-m3/assets/LSOA_2011_London_gen_MHW');
var londonGeom   = london.geometry();
var ccs          = ee.FeatureCollection('projects/casa0025-488411/assets/cri_change_lsoa');
var coolspace    = ee.FeatureCollection('projects/still-cipher-492419-m3/assets/CoolSpace_2025');
var lsoaExposure = ee.FeatureCollection('projects/still-cipher-492419-m3/assets/London_HeatExposure_2021');

var greyStyle = [
  {elementType:'geometry',           stylers:[{color:'#f1f1f1'}]},
  {elementType:'labels.text.fill',   stylers:[{color:'#777777'}]},
  {elementType:'labels.text.stroke', stylers:[{color:'#ffffff'}]},
  {featureType:'administrative.locality', elementType:'geometry.stroke',
   stylers:[{color:'#c7c7c7'},{weight:0.7}]},
  {featureType:'road',    elementType:'geometry', stylers:[{color:'#ffffff'}]},
  {featureType:'road',    elementType:'labels',   stylers:[{visibility:'off'}]},
  {featureType:'poi',     stylers:[{visibility:'off'}]},
  {featureType:'transit', stylers:[{visibility:'off'}]},
  {featureType:'water',   elementType:'geometry', stylers:[{color:'#dceaf0'}]},
  {featureType:'landscape',elementType:'geometry',stylers:[{color:'#f1f1f1'}]}
];

// ============================================================
// 1. PRE-COMPUTE DATA
// ============================================================
function maskLandsatClouds(image) {
  var qa = image.select('QA_PIXEL');
  return image.updateMask(
    qa.bitwiseAnd(1<<1).eq(0)
     .and(qa.bitwiseAnd(1<<3).eq(0))
     .and(qa.bitwiseAnd(1<<4).eq(0)));
}
function getLST(year) {
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(londonGeom).filterDate(year+'-05-01',year+'-08-31')
    .filter(ee.Filter.lt('CLOUD_COVER',15)).map(maskLandsatClouds);
  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(londonGeom).filterDate(year+'-05-01',year+'-08-31')
    .filter(ee.Filter.lt('CLOUD_COVER',15)).map(maskLandsatClouds);
  print(year+' LST scenes:',l8.merge(l9).size());
  return l8.merge(l9).median().clip(london)
    .select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15);
}
var lstImages = {'2022':getLST('2022'),'2024':getLST('2024'),'2025':getLST('2025')};

var ndviPalette = ['#f7fcf5','#e5f5e0','#a1d99b','#41ab5d','#238b45','#00441b'];
var ndbiPalette = ['#f7fbff','#deebf7','#9ecae1','#4292c6','#2171b5','#08306b'];
function getVegBuilt(year) {
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(londonGeom).filterDate(year+'-05-01',year+'-08-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',20));
  var img = s2.median().clip(london);
  return img.normalizedDifference(['B8','B4']).rename('NDVI')
     .addBands(img.normalizedDifference(['B11','B8']).rename('NDBI'));
}
var vegData = {'2022':getVegBuilt('2022'),'2024':getVegBuilt('2024'),'2025':getVegBuilt('2025')};

var scorePalette = ['#a50026','#f46d43','#fee08b','#a6d96a','#1a9850'];
var SELECT_COLOR = '#00BFFF';
var SELECT_FILL  = '00BFFF22';

var ccsLayerConfig = {
  'CCS Change 2022-2025':{field:'cri_change', type:'change'},
  'CCS 2025':            {field:'cri25_mean', type:'score'},
  'CCS 2024':            {field:'cri24_mean', type:'score'},
  'CCS 2022':            {field:'cri22_mean', type:'score'}
};
function classifyChange(f,field) {
  var v=ee.Number(f.get(field));
  var fill=ee.String(ee.Algorithms.If(v.lt(-0.3),'#a63603',ee.Algorithms.If(v.lt(-0.1),'#f4a582',ee.Algorithms.If(v.lt(0.1),'#f2efe9',ee.Algorithms.If(v.lt(0.3),'#67a9cf','#2166ac')))));
  var cls=ee.String(ee.Algorithms.If(v.lt(-0.3),'Strong decline',ee.Algorithms.If(v.lt(-0.1),'Moderate decline',ee.Algorithms.If(v.lt(0.1),'Stable / slight change',ee.Algorithms.If(v.lt(0.3),'Moderate improvement','Strong improvement')))));
  return f.set({map_value:v,class_name:cls,style:{color:'#666666',width:0.16,fillColor:fill}});
}
function classifyScore(f,field) {
  var v=ee.Number(f.get(field));
  var fill=ee.String(ee.Algorithms.If(v.lt(-0.8),scorePalette[0],ee.Algorithms.If(v.lt(-0.6),scorePalette[1],ee.Algorithms.If(v.lt(-0.4),scorePalette[2],ee.Algorithms.If(v.lt(-0.2),scorePalette[3],scorePalette[4])))));
  var cls=ee.String(ee.Algorithms.If(v.lt(-0.8),'Lowest cooling condition',ee.Algorithms.If(v.lt(-0.6),'Low cooling condition',ee.Algorithms.If(v.lt(-0.4),'Moderate cooling condition',ee.Algorithms.If(v.lt(-0.2),'Relatively strong cooling condition','Strongest cooling condition')))));
  return f.set({map_value:v,class_name:cls,style:{color:'#666666',width:0.14,fillColor:fill}});
}
function getCCSStyled(layerName) {
  var cfg=ccsLayerConfig[layerName];
  if(cfg.type==='change') return ccs.map(function(f){return classifyChange(f,cfg.field);});
  return ccs.map(function(f){return classifyScore(f,cfg.field);});
}

var coolspacePoints = coolspace.map(function(f){
  return f.setGeometry(ee.Geometry.Point([ee.Number(f.get('x')),ee.Number(f.get('y'))],'EPSG:27700'));
});
var coolspaceBuffer = coolspacePoints.map(function(f){return f.buffer(500);});

// ============================================================
// 2. ROOT LAYOUT
// ============================================================
var moduleNames = [
  'Module 1: Heat Environment',
  'Module 2: Cooling Condition Score',
  'Module 3: Heat Exposure & Cool Spaces'
];
var activeModule = 0;

var rootPanel = ui.Panel({layout:ui.Panel.Layout.Flow('vertical'),style:{stretch:'both'}});

// NAV BUTTON STRATEGY:
// GEE ignores most backgroundColor values on buttons and renders them white/light grey.
// Solution: use a LIGHT navbar background so the default white buttons are visible,
// distinguish active vs inactive via text colour, font weight, and prefix symbol.
var btnStyle = {
  fontSize:'13px', margin:'2px 6px', padding:'6px 6px',
  color:'#2c5f7a',        // dark teal text — readable on light navbar
  fontWeight:'normal'
};
var btnActiveStyle = {
  fontSize:'13px', margin:'2px 6px', padding:'6px 6px',
  color:'#0a3d55',        // darker text for active
  fontWeight:'bold'
};

// Navbar: use a light background so white/grey GEE buttons stand out
var navBar = ui.Panel({
  layout:ui.Panel.Layout.Flow('horizontal'),
  style: {backgroundColor:'#d6eaf5', padding:'8px 16px', stretch:'horizontal'}
});
navBar.add(ui.Label('Cool Refuge London',
  {fontSize:'24px',fontWeight:'bold',color:'#123047',margin:'3px 24px 3px 0', padding:'5px 5px'}));

// Button labels: active gets a bullet prefix to visually distinguish without background
var moduleLabels = [
  'Module 1: Heat Environment',
  'Module 2: Cooling Condition Score',
  'Module 3: Heat Exposure & Cool Spaces'
];

var navBtns = moduleNames.map(function(name,i){
  var label = (i===activeModule) ? ('> '+name) : name;
  return ui.Button({
    label: label,
    style:(i===activeModule)?btnActiveStyle:btnStyle,
    onClick:function(){switchModule(i);}
  });
});
navBtns.forEach(function(btn){navBar.add(btn);});

var contentRow    = ui.Panel({layout:ui.Panel.Layout.Flow('horizontal'),style:{stretch:'both'}});
var mapPanel      = ui.Map();
var leftContainer = ui.Panel({style:{width:'360px',stretch:'vertical',
  backgroundColor:'#ffffff',border:'1px solid #d1d5db'}});

mapPanel.setOptions('Grey',{'Grey':greyStyle});
mapPanel.setCenter(-0.1278,51.5074,10);
mapPanel.setControlVisibility({all:false,zoomControl:true,scaleControl:true,
  layerList:true,fullscreenControl:true});

rootPanel.add(navBar);
rootPanel.add(contentRow);
contentRow.add(leftContainer);
contentRow.add(mapPanel);
ui.root.clear();
ui.root.add(rootPanel);
ui.root.setLayout(ui.Panel.Layout.Flow('vertical'));

var legendPanel = ui.Panel({
  style:{position:'bottom-right',padding:'10px',
    backgroundColor:'#ffffff',border:'1px solid #cccccc'}
});
mapPanel.add(legendPanel);
function clearLegend(){legendPanel.clear();}
function legendColorRow(color,label){
  return ui.Panel({
    widgets:[
      ui.Label({style:{backgroundColor:color,padding:'7px',
        margin:'0 8px 4px 0',border:'1px solid #cccccc'}}),
      ui.Label(label,{fontSize:'11px',color:'#333333',margin:'0 0 4px 0'})
    ],
    layout:ui.Panel.Layout.Flow('horizontal')
  });
}

// ============================================================
// 3. MODULE 1 — Heat Environment
// FIX: refresh1 ONLY adds LST/NDVI/NDBI layers — no coolspace layers
// ============================================================
var m1State = {layerName:'LST (Surface Temperature)',year:'2025',opacity:0.7};

function buildModule1Panel() {
  var p = ui.Panel({style:{padding:'15px',stretch:'both'}});
  p.add(ui.Label('Heat Environment',{fontSize:'20px',fontWeight:'bold',color:'#1a365d'}));
  p.add(ui.Label('LST · NDVI · NDBI —— select indicator and year',
    {fontSize:'12px',color:'#718096',margin:'0 0 12px 0'}));

  p.add(ui.Label('Indicator:',{fontWeight:'bold',fontSize:'13px'}));
  var layerSel = ui.Select({
    items:['LST (Surface Temperature)','NDVI (Vegetation)','NDBI (Built-up)'],
    value:m1State.layerName,style:{width:'100%',margin:'4px 0 10px 0'}
  });
  p.add(layerSel);

  p.add(ui.Label('Year:',{fontWeight:'bold',fontSize:'13px'}));
  var yearSel = ui.Select({
    items:['2022','2024','2025'],value:m1State.year,
    style:{width:'100%',margin:'4px 0 10px 0'}
  });
  p.add(yearSel);

  p.add(ui.Label('Opacity:',{fontSize:'13px'}));
  var opSl = ui.Slider({min:0,max:1,value:m1State.opacity,step:0.1,
    style:{width:'100%',margin:'0 0 14px 0'}});
  p.add(opSl);

  var cityCard = ui.Panel({style:{padding:'10px',backgroundColor:'#f0f7ff',
    border:'1px solid #bee3f8',margin:'0 0 12px 0'}});
  cityCard.add(ui.Label('Citywide mean LST:',{fontSize:'13px',color:'#01579b'}));
  var cityVal = ui.Label('—',{fontSize:'22px',fontWeight:'bold',color:'#01579b'});
  cityCard.add(cityVal);
  p.add(cityCard);

  var clickCard = ui.Panel({style:{padding:'12px',backgroundColor:'#f8f9fa',
    border:'1px solid #dfe6e9',margin:'0 0 12px 0'}});
  var clickTitle = ui.Label('Click a point on the map to inspect a LSOA',
    {fontSize:'12px',color:'#636e72',fontStyle:'italic'});
  clickCard.add(clickTitle);

  function makeStatRow(labelTxt,valueColor){
    var lbl = ui.Label(labelTxt,
      {fontSize:'13px',color:'#636e72',margin:'8px 0 0 0',stretch:'horizontal'});
    var val = ui.Label('—',
      {fontSize:'18px',fontWeight:'bold',color:valueColor,margin:'4px 0 2px 10px'});
    return {row:ui.Panel({widgets:[lbl,val],layout:ui.Panel.Layout.Flow('horizontal')}),val:val};
  }
  var meanRow = makeStatRow('Mean temp:','#d63031');
  var maxRow  = makeStatRow('Max temp:', '#922b21');
  var minRow  = makeStatRow('Min temp:', '#0984e3');
  clickCard.add(meanRow.row);
  clickCard.add(maxRow.row);
  clickCard.add(minRow.row);

  var bandVal = ui.Label('',
    {fontSize:'16px',fontWeight:'bold',color:'#2d7a2d',margin:'8px 0 4px 0'});
  var statusBadge = ui.Label('',
    {fontSize:'12px',fontWeight:'bold',padding:'4px 10px',margin:'6px 0 0 0',
     backgroundColor:'#f0fff4',color:'#22543d'});
  clickCard.add(bandVal);
  clickCard.add(statusBadge);
  p.add(clickCard);

  function renderLegend1(type){
    clearLegend();
    if(type==='LST'){
      legendPanel.add(ui.Label('Surface Temp (°C)',{fontWeight:'bold',margin:'0 0 6px 0'}));
      legendPanel.add(ui.Thumbnail({
        image:ee.Image.pixelLonLat().select('longitude'),
        params:{bbox:[0,0,1,0.1],dimensions:'200x20',format:'png',
          min:0,max:1,palette:['blue','cyan','green','yellow','red']},
        style:{stretch:'horizontal',margin:'0 8px',maxHeight:'20px'}
      }));
      legendPanel.add(ui.Panel({widgets:[
        ui.Label('20 °C',{margin:'4px 8px'}),
        ui.Label('30 °C',{margin:'4px 8px',textAlign:'center',stretch:'horizontal'}),
        ui.Label('40 °C',{margin:'4px 8px'})
      ],layout:ui.Panel.Layout.Flow('horizontal')}));
    } else if(type==='NDVI'){
      legendPanel.add(ui.Label('NDVI Level',{fontWeight:'bold',margin:'0 0 8px 0'}));
      ['Very Low','Low','Moderate','High','Very High','Saturated'].forEach(function(l,i){
        legendPanel.add(legendColorRow(ndviPalette[i],l));
      });
    } else {
      legendPanel.add(ui.Label('NDBI Level',{fontWeight:'bold',margin:'0 0 8px 0'}));
      ['Very Low','Low','Moderate','High','Very High','Saturated'].forEach(function(l,i){
        legendPanel.add(legendColorRow(ndbiPalette[i],l));
      });
    }
  }

  function updateCityAvg(year){
    cityVal.setValue('Calculating...');
    lstImages[year].reduceRegion({
      reducer:ee.Reducer.mean(),geometry:londonGeom,scale:100,maxPixels:1e9
    }).evaluate(function(r){
      cityVal.setValue(r&&r.ST_B10?r.ST_B10.toFixed(2)+' °C':'No data');
    });
  }

  // FIX: only adds the single indicator layer — never touches coolspace
  function refreshMap1(){
    mapPanel.layers().reset();
    var type    = layerSel.getValue();
    var year    = yearSel.getValue();
    var opacity = opSl.getValue();
    m1State.layerName = type;
    m1State.year      = year;
    m1State.opacity   = opacity;

    if(type==='LST (Surface Temperature)'){
      cityCard.style().set('shown',true);
      var lyr = ui.Map.Layer(lstImages[year],
        {min:20,max:40,palette:['blue','cyan','green','yellow','red']},'LST '+year);
      lyr.setOpacity(opacity);
      mapPanel.layers().add(lyr);
      renderLegend1('LST');
      updateCityAvg(year);
    } else {
      cityCard.style().set('shown',false);
      var band = (type.indexOf('NDVI')!==-1)?'NDVI':'NDBI';
      var vis  = (band==='NDVI')
        ?{min:0,max:0.8,palette:ndviPalette}
        :{min:-0.5,max:0.5,palette:ndbiPalette};
      var lyr2 = ui.Map.Layer(vegData[year].select(band),vis,band+' '+year);
      lyr2.setOpacity(opacity);
      mapPanel.layers().add(lyr2);
      renderLegend1(band);
    }
  }

  layerSel.onChange(function(){refreshMap1();});
  yearSel.onChange(function(){refreshMap1();});
  opSl.onSlide(function(v){
    m1State.opacity=v;
    if(mapPanel.layers().length()>0)mapPanel.layers().get(0).setOpacity(v);
  });

  mapPanel.onClick(function(coords){
    var pt=ee.Geometry.Point(coords.lon,coords.lat);
    lsoa.filterBounds(pt).evaluate(function(fc){
      if(!fc.features.length){clickTitle.setValue('No valid region selected.');return;}
      var name=fc.features[0].properties['LSOA11NM'];
      clickTitle.setValue('LSOA: '+name);
      var type=layerSel.getValue();
      var year=yearSel.getValue();
      var geom=ee.Feature(fc.features[0]).geometry();
      mapPanel.layers().set(1,ui.Map.Layer(
        ee.Image().paint(lsoa.filterBounds(pt),0,3),
        {palette:'000000'},'Selected LSOA'));

      if(type==='LST (Surface Temperature)'){
        meanRow.row.style().set('shown',true);
        maxRow.row.style().set('shown',true);
        minRow.row.style().set('shown',true);
        bandVal.style().set('shown',false);
        statusBadge.style().set('shown',false);
        lstImages[year].reduceRegion({
          reducer:ee.Reducer.mean()
            .combine({reducer2:ee.Reducer.max(),sharedInputs:true})
            .combine({reducer2:ee.Reducer.min(),sharedInputs:true}),
          geometry:geom,scale:30,maxPixels:1e9
        }).evaluate(function(r){
          meanRow.val.setValue((r.ST_B10_mean||0).toFixed(2)+' °C');
          maxRow.val.setValue( (r.ST_B10_max ||0).toFixed(2)+' °C');
          minRow.val.setValue( (r.ST_B10_min ||0).toFixed(2)+' °C');
        });
      } else {
        meanRow.row.style().set('shown',false);
        maxRow.row.style().set('shown',false);
        minRow.row.style().set('shown',false);
        bandVal.style().set('shown',true);
        statusBadge.style().set('shown',true);
        vegData[year].reduceRegion({
          reducer:ee.Reducer.mean(),geometry:geom,scale:10,maxPixels:1e9
        }).evaluate(function(r){
          var nVal=r?(r.NDVI||0):0;
          var bVal=r?(r.NDBI||0):0;
          var band=(type.indexOf('NDVI')!==-1)?'NDVI':'NDBI';
          bandVal.setValue(band+' mean: '+(r?(r[band]||0).toFixed(4):'—'));
          if(band==='NDVI'){
            var status,bg,fg;
            if(nVal>0.45&&bVal<-0.05){status='Optimal Cooling Potential';bg='#f0fff4';fg='#22543d';}
            else if(nVal<0.25||bVal>0.15){status='Suboptimal Cooling Capacity';bg='#fafffa';fg='#4a7c63';}
            else{status='Moderate Cooling Capacity';bg='#f5fff8';fg='#2c6e49';}
            statusBadge.setValue(status);
            statusBadge.style().set({backgroundColor:bg,color:fg});
          } else {statusBadge.setValue('');}
        });
      }
    });
  });

  // NOTE: do NOT call refreshMap1() here — switchModule() calls it
  return {panel:p,refresh:refreshMap1};
}

// ============================================================
// 4. MODULE 2 — CCS + CoolSpace toggle
// ============================================================
var m2State = {
  layerName:'CCS Change 2022-2025',filter:'All classes',
  opacity:0.8,showCoolSpace:true
};

function buildModule2Panel(){
  var p = ui.Panel({style:{padding:'15px',stretch:'both'}});
  p.add(ui.Label('Cooling Condition Score',{fontSize:'20px',fontWeight:'bold',color:'#123047'}));
  p.add(ui.Label('Composite ndicator: LST + NDVI + NDBI — 2022 to 2025',
    {fontSize:'12px',color:'#5f7280',margin:'0 0 8px 0'}));
  p.add(ui.Label('CCS measures surface cooling potential across London LSOAs. The change layer highlights where conditions improved or declined.',
    {fontSize:'12px',color:'#555555',margin:'0 0 14px 0'}));

  p.add(ui.Label('Select layer:',{fontWeight:'bold',fontSize:'13px'}));
  var layerSel = ui.Select({
    items:Object.keys(ccsLayerConfig),value:m2State.layerName,
    style:{width:'100%',margin:'4px 0 10px 0'}
  });
  p.add(layerSel);

  p.add(ui.Label('Filter (only applied to change layer):',{fontWeight:'bold',fontSize:'13px'}));
  var filterSel = ui.Select({
    items:['All classes','Declining areas','Strong decline only',
           'Stable / slight change','Improvement areas'],
    value:m2State.filter,style:{width:'100%',margin:'4px 0 10px 0'}
  });
  p.add(filterSel);

  p.add(ui.Label('Opacity:',{fontSize:'13px'}));
  var opSl = ui.Slider({min:0,max:1,value:m2State.opacity,step:0.1,
    style:{width:'100%',margin:'0 0 10px 0'}});
  p.add(opSl);

  var coolToggle = ui.Checkbox({
    label:'Show Indoor Cool Space Sites',value:m2State.showCoolSpace,
    style:{fontSize:'13px',margin:'0 0 12px 0'}
  });
  p.add(coolToggle);

  var viewDesc = ui.Label('',{fontSize:'12px',color:'#555555',padding:'8px',
    backgroundColor:'#f4f7f9',border:'1px solid #d7e5ec',margin:'0 0 12px 0'});
  p.add(viewDesc);

  var clickInfo = ui.Label('Click a LSOA to view CCS values.',
    {fontSize:'12px',color:'#333333',padding:'10px',backgroundColor:'#f4f7f9',
     border:'1px solid #d7e5ec',margin:'0 0 8px 0',whiteSpace:'pre'});
  p.add(clickInfo);

  var interpInfo = ui.Label('',
    {fontSize:'12px',color:'#333333',padding:'10px',backgroundColor:'#fffdf5',
     border:'1px solid #ead9a6',margin:'0 0 12px 0',whiteSpace:'pre'});
  p.add(interpInfo);

  var chartPanel2 = ui.Panel({style:{margin:'0 0 12px 0'}});
  p.add(chartPanel2);

  var filterMap = {
    'All classes':null,'Declining areas':'decline',
    'Strong decline only':'strong_decline',
    'Stable / slight change':'stable','Improvement areas':'improvement'
  };
  function applyFilter(collection,fname){
    var ft=filterMap[fname];
    if(!ft)return collection;
    if(ft==='decline')       return collection.filter(ee.Filter.or(ee.Filter.eq('class_name','Strong decline'),ee.Filter.eq('class_name','Moderate decline')));
    if(ft==='strong_decline')return collection.filter(ee.Filter.eq('class_name','Strong decline'));
    if(ft==='stable')        return collection.filter(ee.Filter.eq('class_name','Stable / slight change'));
    if(ft==='improvement')   return collection.filter(ee.Filter.or(ee.Filter.eq('class_name','Moderate improvement'),ee.Filter.eq('class_name','Strong improvement')));
    return collection;
  }

  function renderLegend2(type){
    clearLegend();
    if(type==='change'){
      legendPanel.add(ui.Label('CCS Change',{fontWeight:'bold',margin:'0 0 8px 0'}));
      legendPanel.add(legendColorRow('#a63603','Strong decline  (< -0.3)'));
      legendPanel.add(legendColorRow('#f4a582','Moderate decline  (-0.3 to -0.1)'));
      legendPanel.add(legendColorRow('#f2efe9','Stable  (-0.1 to 0.1)'));
      legendPanel.add(legendColorRow('#67a9cf','Moderate improvement  (0.1 to 0.3)'));
      legendPanel.add(legendColorRow('#2166ac','Strong improvement  (> 0.3)'));
    } else {
      legendPanel.add(ui.Label('Cooling Condition',{fontWeight:'bold',margin:'0 0 8px 0'}));
      ['Lowest','Low','Moderate','Relatively strong','Strongest'].forEach(function(l,i){
        legendPanel.add(legendColorRow(scorePalette[i],l+' cooling condition'));
      });
    }
    legendPanel.add(legendColorRow('#87CEEB','Indoor Cool Space Site'));
  }

  function updateChart2(){
    chartPanel2.clear();
    var cfg    = ccsLayerConfig[m2State.layerName];
    var styled = applyFilter(getCCSStyled(m2State.layerName),m2State.filter);
    var labels = cfg.type==='change'
      ?['Strong decline','Moderate decline','Stable / slight change','Moderate improvement','Strong improvement']
      :['Lowest cooling condition','Low cooling condition','Moderate cooling condition',
        'Relatively strong cooling condition','Strongest cooling condition'];
    var colors = cfg.type==='change'
      ?['#a63603','#f4a582','#f2efe9','#67a9cf','#2166ac']:scorePalette;
    var statsFC = ee.FeatureCollection(labels.map(function(label){
      return ee.Feature(null,{class_name:label,
        count:styled.filter(ee.Filter.eq('class_name',label)).size()});
    }));
    chartPanel2.add(ui.Chart.feature.byFeature({
      features:statsFC,xProperty:'class_name',yProperties:['count']
    }).setChartType('PieChart').setOptions({
      pieHole:0.38,colors:colors,chartArea:{width:'84%',height:'76%'},
      backgroundColor:'transparent',legend:{textStyle:{fontSize:9}}
    }));
  }

  function refreshMap2(){
    mapPanel.layers().reset();
    var styled  = applyFilter(getCCSStyled(m2State.layerName),m2State.filter);
    var mainLyr = ui.Map.Layer(styled.style({styleProperty:'style'}),{},m2State.layerName);
    mainLyr.setOpacity(m2State.opacity);
    mapPanel.layers().set(0,mainLyr);
    mapPanel.layers().set(1,ui.Map.Layer(
      ee.FeatureCollection([]).style({color:'000000',width:2.5,fillColor:'00000000'}),
      {},'Selected LSOA'));
    var coolLyr = ui.Map.Layer(coolspacePoints,{color:'87CEEB',pointSize:1},'Indoor Cool Space Sites');
    coolLyr.setShown(m2State.showCoolSpace);
    mapPanel.layers().set(2,coolLyr);
    renderLegend2(ccsLayerConfig[m2State.layerName].type);
    viewDesc.setValue(m2State.layerName==='CCS Change 2022-2025'
      ?'Red = decline in cooling conditions; Blue = improvement.'
      :'Showing CCS spatial pattern for the selected year.');
    updateChart2();
  }

  layerSel.onChange(function(v){
    m2State.layerName=v;
    if(ccsLayerConfig[v].type!=='change'){filterSel.setValue('All classes',false);m2State.filter='All classes';}
    refreshMap2();
  });
  filterSel.onChange(function(v){m2State.filter=v;refreshMap2();});
  opSl.onSlide(function(v){
    m2State.opacity=v;
    if(mapPanel.layers().length()>0)mapPanel.layers().get(0).setOpacity(v);
  });
  coolToggle.onChange(function(checked){
    m2State.showCoolSpace=checked;
    if(mapPanel.layers().length()>2)mapPanel.layers().get(2).setShown(checked);
  });

  mapPanel.onClick(function(coords){
    var pt=ee.Geometry.Point([coords.lon,coords.lat]);
    ccs.filterBounds(pt).first().evaluate(function(feature){
      if(feature){
        var pr=feature.properties;
        var ch=Number(pr.cri_change);
        var interp=ch<-0.3?'Strong decline':ch<-0.1?'Moderate decline':
                   ch<0.1?'Stable':ch<0.3?'Moderate improvement':'Strong improvement';
        clickInfo.setValue('LSOA: '+pr.lsoa21cd+'\nName: '+pr.lsoa21nm+
          '\nCCS 2022: '+Number(pr.cri22_mean).toFixed(4)+
          '\nCCS 2024: '+Number(pr.cri24_mean).toFixed(4)+
          '\nCCS 2025: '+Number(pr.cri25_mean).toFixed(4)+
          '\nChange:   '+ch.toFixed(4));
        interpInfo.setValue('Interpretation: This LSOA shows '+interp+' in cooling conditions.');
        mapPanel.layers().set(1,ui.Map.Layer(
          ee.FeatureCollection([ee.Feature(feature)])
            .style({color:'000000',width:2.5,fillColor:'00000000'}),
          {},'Selected LSOA'));
      } else {clickInfo.setValue('No LSOA selected.');interpInfo.setValue('');}
    });
  });

  // NOTE: do NOT call refreshMap2() here — switchModule() calls it
  return {panel:p,refresh:refreshMap2};
}

// ============================================================
// 5. MODULE 3 — Heat Exposure & Cool Spaces
// FIX: bootstrap is async; refresh guard prevents premature render;
//      pie chart uses direct evaluate pattern that was working in original
// ============================================================
var m3State = {
  filter:'Show All',opacity:0.75,showCoolSpace:true,
  globalVis:null,threshold:null,ready:false
};

// Pie chart data is computed once and stored so it can be redrawn on tab return
var m3PieData = null;   // will hold {covered, gap} after first evaluate

function buildModule3Panel(){
  var p = ui.Panel({style:{padding:'15px',stretch:'both'}});
  p.add(ui.Label('Heat Exposure & Cool Spaces',
    {fontSize:'20px',fontWeight:'bold',color:'#1a365d'}));
  p.add(ui.Label('Population heat exposure by LSOA · Indoor cool space sites with 500m catchment (7-minute walk accessibility)',
    {fontSize:'12px',color:'#718096',margin:'0 0 12px 0'}));

  var statsCard = ui.Panel({style:{padding:'10px',backgroundColor:'#f0f7ff',
    border:'1px solid #bee3f8',margin:'0 0 12px 0'}});
  var siteCountLbl = ui.Label('Cool Space Sites: loading...',{fontWeight:'bold',color:'#2b6cb0'});
  statsCard.add(siteCountLbl);
  p.add(statsCard);

  p.add(ui.Label('Filter Exposure:',{fontWeight:'bold',fontSize:'13px'}));
  var filterSel3 = ui.Select({
    items:['Show All','Low & Moderate','High & Extreme High'],
    value:m3State.filter,style:{width:'100%',margin:'4px 0 10px 0'}
  });
  p.add(filterSel3);

  var coolToggle3 = ui.Checkbox({
    label:'Show Indoor Cool Space Sites & 500m catchment',value:m3State.showCoolSpace,
    style:{fontSize:'13px',margin:'0 0 8px 0'}
  });
  p.add(coolToggle3);

  p.add(ui.Label('Opacity:',{fontSize:'13px'}));
  var opSl3 = ui.Slider({min:0,max:1,value:m3State.opacity,step:0.05,
    style:{width:'100%',margin:'0 0 14px 0'}});
  p.add(opSl3);

  var chartCont = ui.Panel({style:{margin:'0 0 12px 0'}});
  p.add(chartCont);

  function renderLegend3(vis){
    clearLegend();
    legendPanel.add(ui.Label('Legend',{fontWeight:'bold',margin:'0 0 8px 0'}));
    ['Low Exposure','Moderate','High','Extreme High'].forEach(function(l,i){
      legendPanel.add(legendColorRow(vis.palette[i],l));
    });
    legendPanel.add(legendColorRow('#87CEEB','Cool Space (500m catchment)'));
  }

  // FIX: draw pie chart from stored m3PieData — no extra server calls on tab return
  function drawPieChart(){
    chartCont.clear();
    if(!m3PieData){
      chartCont.add(ui.Label('Calculating accessibility...',
        {fontSize:'12px',color:'#718096',fontStyle:'italic'}));
      return;
    }
    var total   = m3PieData.covered + m3PieData.gap;
    var pct     = total>0?(m3PieData.covered/total*100).toFixed(1):'—';
    var statsFC = ee.FeatureCollection([
      ee.Feature(null,{label:'Covered Area', value:m3PieData.covered}),
      ee.Feature(null,{label:'Service Gap',  value:m3PieData.gap})
    ]);
    chartCont.add(ui.Chart.feature.byFeature(statsFC,'label','value')
      .setChartType('PieChart')
      .setOptions({
        title:'Cool Accessibility Gap in High-Exposure Areas',
        colors:['#87CEEB','#e53e3e'],pieHole:0.4,
        chartArea:{width:'90%',height:'78%'},
        legend:{position:'bottom',textStyle:{fontSize:10}}
      }));
  }

  function refreshMap3(){
    if(!m3State.ready){return;}   // wait for async bootstrap
    mapPanel.layers().reset();
    var sel=m3State.filter;
    var filtered=lsoaExposure;
    if(sel==='Low & Moderate')      filtered=lsoaExposure.filter(ee.Filter.lt('exposure',m3State.threshold));
    if(sel==='High & Extreme High') filtered=lsoaExposure.filter(ee.Filter.gte('exposure',m3State.threshold));

    var img    = filtered.reduceToImage({properties:['exposure'],reducer:ee.Reducer.first()});
    var expLyr = ui.Map.Layer(img.clip(london),m3State.globalVis,'Exposure: '+sel);
    expLyr.setOpacity(m3State.opacity);
    mapPanel.layers().set(0,expLyr);

    var bufLyr = ui.Map.Layer(
      coolspaceBuffer.style({color:'87CEEB00',fillColor:'87CEEB85',width:0}),
      {},'500m Catchment');
    var ptLyr  = ui.Map.Layer(coolspacePoints,{color:'87CEEB',pointSize:1},'Cool Space Sites');
    mapPanel.layers().set(1,bufLyr);
    mapPanel.layers().set(2,ptLyr);

    mapPanel.layers().get(1).setShown(m3State.showCoolSpace);
    mapPanel.layers().get(2).setShown(m3State.showCoolSpace);

    renderLegend3(m3State.globalVis);
    drawPieChart();
  }

  filterSel3.onChange(function(v){m3State.filter=v;refreshMap3();});
  coolToggle3.onChange(function(checked){
    m3State.showCoolSpace=checked;
    if(mapPanel.layers().length()>2){
      mapPanel.layers().get(1).setShown(checked);
      mapPanel.layers().get(2).setShown(checked);
    }
  });
  opSl3.onSlide(function(v){
    m3State.opacity=v;
    if(mapPanel.layers().length()>0)mapPanel.layers().get(0).setOpacity(v);
  });

  // FIX: async bootstrap — only sets ready:true and triggers render after ALL data arrive
  lsoaExposure.reduceColumns({
    selectors:['exposure'],reducer:ee.Reducer.percentile([5,50,95])
  }).evaluate(function(s){
    m3State.threshold = s.p50;
    m3State.globalVis = {min:s.p5,max:s.p95,
      palette:['#fff5f0','#fb6a4a','#a50f15','#67000d']};

    coolspacePoints.size().evaluate(function(cnt){
      siteCountLbl.setValue('Total Indoor Cool Space Sites: '+cnt);
    });

    // Compute accessibility pie chart data
    var highRisk = lsoaExposure.filter(ee.Filter.gte('exposure',s.p50));
    var bufImg   = ee.Image.constant(1).clip(coolspaceBuffer).unmask(0);
    var analyzed = bufImg.reduceRegions({collection:highRisk,reducer:ee.Reducer.mean(),scale:100});
    var totalArea   = highRisk.map(function(f){return f.set('a',f.geometry().area(1));}).aggregate_sum('a');
    var coveredArea = analyzed.map(function(f){
      return f.set('ca',f.geometry().area(1).multiply(ee.Number(f.get('mean')).min(1)));
    }).aggregate_sum('ca');

    ee.Dictionary({total:totalArea,covered:coveredArea}).evaluate(function(res){
      if(res&&res.total){
        var covered = res.covered||0;
        var gap     = Math.max(0,(res.total||0)-covered);
        m3PieData   = {covered:covered,gap:gap};
      }
      // Mark ready and render — this is the ONLY place refreshMap3 is first triggered
      m3State.ready = true;
      // Only render if Module 3 is the active module when bootstrap finishes
      if(activeModule===2){refreshMap3();}
      else{drawPieChart();}  // pre-populate chart even if not active
    });
  });

  // NOTE: do NOT call refreshMap3() here — switchModule() calls it,
  //       but refreshMap3() will early-return if not ready yet
  return {panel:p,refresh:refreshMap3};
}

// ============================================================
// 6. MODULE SWITCHING
// ============================================================
// Build all three modules at startup WITHOUT calling their refresh functions yet
// switchModule(0) at the bottom triggers the first render
var modules = [
  buildModule1Panel(),
  buildModule2Panel(),
  buildModule3Panel()
];

function switchModule(idx){
  navBtns.forEach(function(btn,i){
    btn.style().set(i===idx ? btnActiveStyle : btnStyle);
    btn.setLabel(i===idx ? ('> ' + moduleNames[i]) : moduleNames[i]);
  });
  activeModule=idx;
  leftContainer.clear();
  leftContainer.add(modules[idx].panel);
  modules[idx].refresh();
}

switchModule(0);
