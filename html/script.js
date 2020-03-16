// Add event listeners
// Set temperature buttons

document.getElementById("setMinus").onclick = function() {sendValue('setTemp',Number(document.getElementById("setTemp").value) - 1)};
document.getElementById("setPlus").onclick = function() {sendValue('setTemp',Number(document.getElementById("setTemp").value) + 1)};

// Set temperature dropdown menu
document.getElementById("setTemp").onchange = function() {
	let setTemp = document.getElementById("setTemp").value;
	if (setTemp != "") {
		sendValue("setTemp",setTemp)
	}
}

// Control buttons
document.getElementById("lights").onclick = function() {sendValue('toggleItem','lights')};
document.getElementById("jets1").onclick = function() {sendValue('toggleItem','pump1')};
document.getElementById("jets2").onclick = function() {sendValue('toggleItem','pump2')};


// Set temp button at bottom of web page
/*
document.getElementById("setTempButton").addEventListener("click", function(){
	sendValue("setTemp", document.getElementById("setTemp").value);
});
*/

// Special buttons
function letsgo() {
	if (document.getElementById("lights").style.backgroundColor != "limegreen") { // Lights not on?
		sendValue("toggleItem","lights");
	}
	sendValue("setTemp","100");
}

function alldone() {
	if (document.getElementById("lights").style.backgroundColor == "limegreen") { // Lights on?
		sendValue("toggleItem","lights");
	}
	sendValue("setTemp","96");
}


// socket.io functions
let socket = io();

socket.on('error',function(error) {
	document.getElementById("error").innerHTML = error;
})


let spa = {}; // Keep temperatures in memory

// Receive data websockets
socket.on('data',function(data) {
	//console.log(data);
	data.value = data.value.toString().padStart(2,"0"); // Put zeroes in front so it looks like hex (easier for me to spot in if statements)

	if (data.id == "HF") { // Heat flag -- also contains high/low range info
		let heat = [{"04" : "On hold", "0c" : "Not heating", "2c" : "Waiting", "1c" : "Heating"}, // High range
								{"00" : "On hold", "08" : "Not heating", "28" : "Waiting", "18" : "Heating"}]; // Low range
		
		if (data.value in heat[0]) {
			document.getElementById("HF").innerHTML = heat[0][data.value]; // Heat status
			document.getElementById("HF_0").checked = true; // High/low range
		} else if (data.value in heat[1]) {
			document.getElementById("HF").innerHTML = heat[1][data.value]; // Heat status
			document.getElementById("HF_1").checked = true; // High/low range
		}

	} else if (data.id == "LF") { // Lights
		document.getElementById("lights").style.backgroundColor = {"00" : "red", "03" : "limegreen"}[data.value];

	} else if (data.id == "PP") { // Jets
		let colors = ["red", "limegreen"];
		document.getElementById("jets1").style.backgroundColor = colors[{"00" : [0,0], "02" : [1,0], "08" : [0,1], "0a" : [1,1]}[data.value][0]];
		document.getElementById("jets2").style.backgroundColor = colors[{"00" : [0,0], "02" : [1,0], "08" : [0,1], "0a" : [1,1]}[data.value][1]];

	} else if (data.id == "CP") { // Circ
		document.getElementById("circ").style.backgroundColor = {"00" : "red", "02" : "limegreen"}[data.value];

	} else if (data.id == "2H") { // Filter start hour also has on/off info
		// filter 2 cycle on(1) or off(0)
		let filter2 = Math.floor(parseInt(data.value,16)/128) // this is not displayed right now
		data.value = (parseInt(data.value,16) % 128).toString(16) // mod 128 to take out high bit

	} else if (["TS","RM","M8","TF","CC"].includes(data.id)) { // Temperature scale
		document.getElementById(data.id + "_" + parseInt(data.value,10)).checked = true;

		if (data.id == "TS") {
			let symbol = document.getElementsByClassName("degSymbol");
			for (let i=0; i<symbol.length; i++) {				
				symbol[i].innerHTML = ["&deg;F","&deg;C"][Number(data.value)]
			}
		}
	} else if (data.id == "ST") {	
		let setTempMenu = document.getElementById("setTemp")
		setTempMenu.options[0].text = `${parseInt(data.value,16)}°F`;
		setTempMenu.options[0].value = parseInt(data.value,16);
		setTempMenu.options[0].selected = true;
	}
	
	// Temperatures udpate
	if (["CT","ST","TA","TB","HF"].includes(data.id)) {
		spa[data.id] = data.value;
		if (data.id != "HF") { // Convert temperature numbers into decimal (from hexadecimal)
			spa[data.id] = parseInt(data.value,16).toString().padStart(2,"0");
		}		
		if (spa.CT != undefined && spa.ST != undefined && spa.HF != undefined) { // Make sure there are values (especially on first load)
			spaGauge(spa);
		}
	}

	if (document.getElementById(data.id)) { // id exists ?
		if (["CT","HH","MM","ST","TA","TB"].includes(data.id)) {
			document.getElementById(data.id).innerHTML = parseInt(data.value,16).toString().padStart(2,"0"); // Change hex to decimal
		} else if ([""].includes(data.id)) {
			document.getElementById(data.id).innerHTML = data.value;
		}
	}
})


// Send data to node server
function sendValue(type,param) {
	//console.log(type,param)
	socket.emit('command',{"type" : type, "param" : param});
}



// Draw spa temperature gauge
function spaGauge(data) {
	// In case some variables are not defined
	let vars = ["CT","ST","TA","TB"];
	for (let i=0; i<vars.length; i++) {
		if (! vars[i] in data) {
			data[vars[i]] = 0;
		}
	}

	// Size of SVG and max values to represent
	let width = 550, height = 200;

	// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height});

  // Sets definitions for blue/red gradient
  let defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
 	svg.appendChild(defs);
  let gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  gradient.id = "spaGradient";
  setAttributes(gradient,{"x1":"0%" , "y1":"0%" , "x2":"100%" , "y2":"0%"});
  defs.appendChild(gradient);

	let colors=["0,0,255","255,0,0"];
  for (let i=0; i<colors.length; i++) {
  	let stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  	gradient.appendChild(stop);
 	  setAttributes(stop,{
 	  	"offset" : `${i*100/(colors.length-1)}%`,
 	  	"stop-color" : `rgb(${colors[i]})`
 	  })
  }

  let min = 80, max = 104; // Minimum and maximum temperatures to be represented on the scale
  let range = max - min;
  let thermo = {"x":25, "y":80, "w":500, "h":60}; // To easily adjust temperature gauge appearance (x,y), width, height

	// Draw solid black background
	let solid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  setAttributes(solid,{
  	"x" : thermo.x,
  	"y" : thermo.y,
  	"width" : thermo.w,
  	"height" : thermo.h,
  	"fill": "black"
	})
	svg.appendChild(solid);
	
	// In case temperatures out of bounds
//data={CT:10,ST:10,TA:102,TB:106,HF:"0"}
	let temps = [data.CT,data.ST,data.TA,data.TB];
	let percent = [];
	for (let i=0; i<=3; i++) {
	  percent[i] = (temps[i] - min) / range;
		if (temps[i] > max) {
	  	percent[i] = 1
	  } else if (temps[i] < min) {
	  	percent[i] = 0
	  }
	}

	// Draw full gradient line
	let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  setAttributes(line,{
  	"x1" : thermo.x,
  	"y1" : thermo.y + thermo.h/2,
  	"x2" : thermo.x + thermo.w,
  	"y2" : thermo.y + thermo.h/2 + 0.001,
  	"stroke": "url(#spaGradient)",
  	"stroke-width" : thermo.h,
  	"stroke-dasharray" : "5,2"
	})
	svg.appendChild(line);

	// Hide the part that is beyond the temperature
	let black = document.createElementNS("http://www.w3.org/2000/svg", "line");
  setAttributes(black,{
  	"x1" : thermo.x + thermo.w * percent[0],
  	"y1" : thermo.y + thermo.h/2,
  	"x2" : thermo.x + thermo.w,
  	"y2" : thermo.y + thermo.h/2 + 0.001,  	
  	"stroke": "black",
  	"stroke-width" : thermo.h,
  	"opacity" : 0.75
	})
	svg.appendChild(black);

	// Add markers for heater temp A & B and set temp
	for (let i=3; i>=1; i--) {
		if ((i>1 && data.HF != "0c" && data.HF !="08") || i == 1) { // For heater temps A & B, can't be in "Not heating"
			let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			setAttributes(line,{
	  		"x1" : thermo.x + thermo.w * percent[i],
		  	"y1" : thermo.y ,
		  	"x2" : thermo.x + thermo.w * percent[i],
		  	"y2" : thermo.y + thermo.h  + 0.001,
		  	"stroke" : ["orange","darkslategray","darkslategray"][i-1],
		  	"stroke-width" : 6
			})
			svg.appendChild(line);
		}
	}

	// CT and ST temperature labels
	for (let i=0; i<=1; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : thermo.x + thermo.w * (0.5 + (percent[i] - 0.5) * 0.60),
			"y" : thermo.y + i*thermo.h - 15 + i*30,
			"fill" : ["limegreen","orange"][i],
			"text-anchor" : "middle",
			"dominant-baseline" : ["baseline","hanging"][i]
		})
		text.textContent = [`Spa: ${data.CT}°F`,`Set: ${data.ST}°F`][i];
		text.style.fontSize = "1.0em";
		svg.appendChild(text);
	}
	
  document.getElementById("spaGauge").innerHTML = "";
  document.getElementById("spaGauge").appendChild(svg);
}


// Draw weather graph
google.charts.load('current', {'packages':['corechart']})
socket.on('weather',function(weatherData) {
	if (weatherData != undefined) {
		// Current weather picture
		document.getElementById("icon").src = weatherData.current.icon;

		// Temperature gauge values
		temperatureGauge({
			"temperature" : Number(weatherData.current.temperature),
			"feelsLike" : Number(weatherData.current.feelsLike),
			"low" : Number(weatherData.current.low),
			"high" : Number(weatherData.current.high)
		});

		// Wind gauge
		windGauge({
			"wind" : Number(weatherData.current.wind),
			"windGust" : Number(weatherData.current.windGust),
			"windAngle" : ["N","NE","E","SE","S","SW","W","NW"].indexOf(weatherData.current.windDir) * 360/8 + 40, // Offset of 40deg is relative to where hot tub is pointing compared to true north
			"text" : ["wind " + weatherData.current.wind,"gust " + weatherData.current.windGust,"km/h"],
			"airQualityIndex" : weatherData.current.airQualityIndex,
			"airQualityLevel" : weatherData.current.airQualityLevel
		});

		// Sunrise / sunset gauge
		sunTimes({
			"sunrise_gmt" : weatherData.current.sunrise_gmt,
			"sunset_gmt" : weatherData.current.sunset_gmt,
			"sunrise_text" : weatherData.current.sunrise,
			"sunset_text" : weatherData.current.sunset,
			"moonRise" : weatherData.current.moonRise,
			"moonSet" : weatherData.current.moonSet,
			"moonPhase" : weatherData.current.moonPhase
		});

		// Hourly forecast
		google.charts.setOnLoadCallback(function(){drawWeatherChart(weatherData.hourly)})
	}
})


function drawWeatherChart(weatherData) {
	// Convert data to array	
	let graphData = [["Hour","Temperature",{role: 'annotation'},"Feels like",{role: 'annotation'},"Wind",{role: 'annotation'},"Gust",{role: 'annotation'},"POP"]];
	let keys = ["temperature","feelsLike","wind","windGust","POP"];
	
	// Figure out min and max of temperature + feels like, wind + gust so they have the same range
	let min = {};
	let max = {};
	for (let i=0; i<=2; i=i+2) {		
		let min1 = Math.min(...(weatherData[keys[i]].slice(0,6)));
		let max1 = Math.max(...(weatherData[keys[i]].slice(0,6)));
		let min2 = Math.min(...(weatherData[keys[i+1]].slice(0,6)));
		let max2 = Math.max(...(weatherData[keys[i+1]].slice(0,6)));

		min[keys[i]] = min1;
		max[keys[i]] = max1;
		if (min2 < min1) {
			min[keys[i]] = min2;
		}
		if (max2 > max1) {
			max[keys[i]] = max2;
		}	
	}

	for (let i=0; i<=5; i++) {
		let newData = [weatherData.hour[i]];

		for (let j=0; j<keys.length; j++) { // Put all data for one hour in an array
			newData.push(Number(weatherData[keys[j]][i]));
			if (j != keys.length - 1) { // Add labels for annotations
				newData.push(Number(weatherData[keys[j]][i]))
			}
		}
		graphData.push(newData); // Push the array to the data
	}	

	// Chart data and options
	let data = google.visualization.arrayToDataTable(graphData);

	let colors = {
		'outdoor' : 'dodgerblue',
		'feelsLike' : 'dodgerblue',
		'wind' : 'violet',
		'windGust' : 'violet',
		'POP' : 'blue'
	}

	let fontSize = 30;
	let options = {
		allowHtml: true,
		chartArea: {width:'80%',height:'80%'},
		backgroundColor: '#000',//{ fill:'transparent' },
		legend: {position: 'bottom', textStyle:{color: 'white'}},
		hAxis : {textStyle:{color: 'white'}},
		baselineColor: 'transparent',
    pointSize: 7,
		series: {
			// Gives each series an axis name that matches the Y-axis below.
			0: {targetAxisIndex:0, color:colors.outdoor, lineWidth:'4', annotations: {stemColor:'none', textStyle:{fontSize:fontSize}}},
			1: {targetAxisIndex:1 , color:colors.feelsLike, lineDashStyle:[2,4], annotations: {stemColor:'none', textStyle:{fontSize:fontSize}}},
			2: {targetAxisIndex:2 , color:colors.wind, lineWidth:'4', annotations: {stemColor:'none', textStyle:{fontSize:fontSize}}},
			3: {targetAxisIndex:3 , color:colors.windGust, lineDashStyle:[2,8], annotations: {stemColor:'none', textStyle:{fontSize:fontSize}}},
			4: {targetAxisIndex:4 , color:colors.POP, type:'bars'}
		},
		vAxes: {			
			0: {title:'Outdoor (°C)', gridlines:{count:0,interval:[1,2,5]}, viewWindow:{min:min.temperature-2,max:max.temperature+2}, titleTextStyle:{color: colors.outdoor}, textStyle:{color: colors.outdoor}, textPosition: 'none'},
			1: {format:'decimal', gridlines:{count:0}, viewWindow:{min:min.temperature-2,max:max.temperature+2}, textPosition: 'none'},
			2: {title:'Wind (km/h)', gridlines:{count:0,interval:[1,2,5]}, viewWindow:{min:0, max:max.wind}, titleTextStyle:{color: colors.wind}, textStyle:{color: colors.wind}, textPosition: 'none'},
			3: {format:'decimal', gridlines:{count:0}, viewWindow:{min:0, max:max.wind}, textPosition: 'none'},
			4: {format:'decimal', gridlines:{count:0}, viewWindow:{min:0,max:100}, textPosition: 'none'}
		}
	}

	let chart = new google.visualization.ComboChart(document.getElementById('weatherGraph'));
  chart.draw(data, options);

  // Add weather icons to SVG created by Google chart
  let svg = document.getElementById("weatherGraph").firstChild.firstChild.firstChild.firstChild; // Target the SVG (it's buried in several DIVs)
  for (let i=0; i<=5; i++) {
		let image = document.createElementNS("http://www.w3.org/2000/svg", "image");
	  setAttributes(image,{
	  	"x" : 158.75 + i*126.5 - 24, // negative adjustment to keep the image centered above time (half of image size)
	  	"y" : 490,
	  	"width" : 48,
	  	"height" : 48,
	  	"href" : weatherData.icon[i]
		})
		svg.appendChild(image);
  }
}


// Draw graph
//google.charts.load('current', {'packages':['corechart']})
socket.on('graphData',function(graphData) {
	if (graphData != undefined) {
		google.charts.setOnLoadCallback(function(){drawChart(graphData)})
	}
})

function drawChart(graphData) {
	// Convert to date format
	for (let i=0; i<graphData.length; i++) {
		graphData[i][0] = new Date(graphData[i][0]*1000) // time stored in seconds, so convert to milliseconds
		
		for (let j=1; j<graphData[i].length; j++) {
			graphData[i][j] = Number(graphData[i][j]) // Make sure only numbers are there
		}
	}

	// Add column headings to data
	//graphData.unshift(['Time','Indoor humidity','Outdoor temperature','Indoor temperature'])
	graphData.unshift(['Time','Spa','Outdoor','Heating']);

	// Chart data and options
	let data = google.visualization.arrayToDataTable(graphData);

	let colors = {
		'spa' : 'limegreen',
		'outdoor' : 'dodgerblue',
		'heating' : 'red'
	}

	let options = {
		chartArea:{width:'80%',height:'80%'},
		backgroundColor: '#000',//{ fill:'transparent' },
		legend: {position: 'bottom', textStyle:{color: 'white'}},
		//curveType : 'function',
		hAxis : {format:'HH:mm', textStyle:{color: 'white'}}, // hours:minutes
		series: {
			// Gives each series an axis name that matches the Y-axis below.
			0: {targetAxisIndex:0, color:colors.spa, lineWidth:'4'},
			1: {targetAxisIndex:1 , color:colors.outdoor , lineDashStyle:[4,4]},
			2: {targetAxisIndex:2 , color:colors.heating , type:'area'} // alernatively, "steppedArea"
		},
		vAxes: {
			0: {title:'Spa (°F)', format:'decimal', titleTextStyle:{color: colors.spa}, textStyle:{color: colors.spa}, minorGridlines:{count:0}, viewWindow:{min:90,max:104}},
			1: {title:'Outdoor (°C)', format:'decimal', titleTextStyle:{color: colors.outdoor}, textStyle:{color: colors.outdoor}, gridlines:{count:0}},
			2: {format:'decimal', gridlines:{count:0}, textPosition: 'none', viewWindow:{min:0.1}}
		}
	}

	let chart = new google.visualization.ComboChart(document.getElementById('graph'));
  chart.draw(data, options);
}


function temperatureGauge(data) {
	// Size of SVG and max values to represent
	let width = 280, height = 480;

	// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height});

  // Sets definitions for rainbow gradient
  let defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
 	svg.appendChild(defs);
  let rainbowGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  rainbowGradient.id = "rainbowGradient";
  setAttributes(rainbowGradient,{"x1":"0%" , "y1":"100%" , "x2":"0%" , "y2":"0%"});
  defs.appendChild(rainbowGradient);

	let rainbow=["238,130,238","95,20,150","71,174,230","0,255,0","255,255,0","255,127,0","255,0,0"]
  for (let i=0; i<rainbow.length; i++) {
  	let stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  	rainbowGradient.appendChild(stop);
 	  setAttributes(stop,{
 	  	"offset" : `${i*100/(rainbow.length-1)}%`,
 	  	"stop-color" : `rgb(${rainbow[i]})`
 	  })
  }

  let min = -35, max = 35; // Minimum and maximum temperatures to be represented on the scale
  let range = max - min;
  let thermo = {"x":130, "y":45, "w":60, "h":397}; // To easily adjust temperature gauge appearance (x,y), width, height

	// Draw solid black background
	let solid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  setAttributes(solid,{
  	"x" : thermo.x,
  	"y" : thermo.y,
  	"width" : thermo.w,
  	"height" : thermo.h,
  	"fill": "black"
	})
	svg.appendChild(solid);
	
	// In case temperatures out of bounds
	let temps = [data.temperature,data.high,data.low];
	let percent = [];
	for (let i=0; i<=2; i++) {
	  percent[i] = (temps[i] - min) / range;
		if (temps[i] > max) {
	  	percent[i] = 1
	  } else if (temps[i] < min) {
	  	percent[i] = 0
	  }
	}

	// Draw full rainbow line
	let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  setAttributes(line,{
  	"x1" : thermo.x + thermo.w/2,
  	"y1" : thermo.y,
  	"x2" : thermo.x + thermo.w/2 + 0.001, // .001 otherwise horizontal gradient line doesn't show
  	"y2" : thermo.y + thermo.h,
  	"stroke": "url(#rainbowGradient)",
  	"stroke-width" : thermo.w,
  	"stroke-dasharray" : "5,2"
	})
	svg.appendChild(line);

	// Hide the part that is beyond the temperature
	let black = document.createElementNS("http://www.w3.org/2000/svg", "line");
  setAttributes(black,{
  	"x1" : thermo.x + thermo.w/2,
  	"y1" : thermo.y,
  	"x2" : thermo.x + thermo.w/2 + 0.001,
  	"y2" : thermo.y + (1-percent[0]) * thermo.h,
  	"stroke": "black",
  	"stroke-width" : thermo.w,
  	"opacity" : 0.75
	})
	svg.appendChild(black);

	// Add outdoor and feels like temperature labels
	for (let i=0; i<=1; i++) {
		for (let j=0; j<=1; j++) {
			// Add temperature labels
			let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
			setAttributes(text,{
				"x" : thermo.x - 10,
				"y" : thermo.y + (1-percent[1]) * thermo.h + i*60 + j*-30 - 7,
				"text-anchor" : "end",
				"fill" : "white"
				
			})
			let temps = [data.temperature,data.feelsLike];			
			
			text.textContent = [[temps[i] + " °C",temps[i] + " °C"] , ["Outdoor","Feels like"]][j][i];
			if (data.temperature < data.feelsLike) { // Reverse vertical order of temperatures if "feels like" is higher
				text.textContent = [[temps[1-i] + " °C",temps[1-i] + " °C"] , ["Outdoor","Feels like"]][j][1-i];
			}
			
			text.style.fontSize = ["0.7em","0.5em"][j];
			svg.appendChild(text);
		}
	}

	// Add high and low temps
	for (let i=0; i<=1; i++) {
		// Little pointer line
		let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		setAttributes(line,{
  		"x1" : thermo.x + thermo.w + 2 - 30,
	  	"y1" : thermo.y + (1-percent[i+1]) * thermo.h + 0.001,
	  	"x2" : thermo.x + thermo.w + 15,
	  	"y2" : thermo.y + (1-percent[i+1]) * thermo.h + 0.001,
	  	"stroke": ["red","blue"][i],
	  	"stroke-width" : 4
		})
		svg.appendChild(line);

		// High/low temperature labels
		for (let j=0; j<=1; j++) {
			let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
			setAttributes(text,{
				"x" : thermo.x + thermo.w + 20,
				"y" : thermo.y + (1-percent[i+1]) * thermo.h - 1 + 30*(i*2-1)*j - 5,
				"text-anchor" : "start",
				"fill" : ["red","blue"][i],
				"dominant-baseline" : ["baseline","hanging"][i]
			})
			text.textContent = [[[data.high,data.low][i] + " °C",[data.high,data.low][i] + " °C"], ["high","low"]][j][i];
			text.style.fontSize = "0.5em";
			svg.appendChild(text);
		}
	}
	
  document.getElementById("temperatureGauge").innerHTML = "";
  document.getElementById("temperatureGauge").appendChild(svg);
}


// google search : how to get rgb color of linear gradient svg js
// https://stackoverflow.com/questions/23276926/how-to-get-color-of-svg-rainbowGradient-at-specific-position
function windGauge(data) {
	// Put in array for easier handling
	let values = [data.windGust,data.wind];

	// Size of SVG and max values to represent on wind scale
	let width = 500, height = 240, min = 0, max = 32;
	let circle = {"x" : 400/2, "y" : height/2, "r" : 400/3*1.2};	// Centre x,y and radius and circumference
 	circle.c = 2*Math.PI*circle.r; // Needs to be computed separately because radius needs to be set first
	
	// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height, "viewBox" : "0 -90 400 240"});

  // Create grey background
  let background = document.createElementNS("http://www.w3.org/2000/svg", "circle")
  setAttributes(background,{
  	"stroke" : perc2color(0),
  	"opacity" : 0.7,
  	"stroke-dasharray" : `${circle.c/2}, ${circle.c}` // Dash length, space length
	},"arc",circle)
  svg.appendChild(background);
  
  // Create colored arcs
  let opacity = [0.7, 1]; // Opacity of arcs (first is gust, second is wind)
  for (let i=0; i <=1; i++) {
  	if (values[i] > max) { // Put at maximum if out of range
  		values[i] = max
  	}

  	let percentage = values[i] / max;
  	let arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    setAttributes(arc,{
	  	"stroke" : perc2color(percentage),
	  	"opacity" : opacity[i],
	  	"stroke-dasharray" : `${circle.c/2*percentage}, ${circle.c}` // Dash length, space length
		},"arc",circle)
		svg.appendChild(arc);
	}

	// Add text in centre of gauge
	for (let i=0; i<data.text.length; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : circle.x,
			"y" : circle.y+i*40-60,
			"text-anchor" : "middle"
		})
		text.textContent = data.text[i];
		text.style.fontSize = "0.8em";
		svg.appendChild(text);
	}

	// Add wind direction pointer (offset by 40 degrees because of orientation of hot tub)
	let windVane = document.createElementNS("http://www.w3.org/2000/svg", "g"); // Create a group
 	setAttributes(windVane,{
	 	transform : `rotate(${data.windAngle} 0 -40)` // Rotate it according to wind direction
	})
	svg.appendChild(windVane); // Add the entire group to the SVG

	// Arrow pointer
	let arrowX = 0, arrowY = -40; // To make it easy to move around
	let arrowTop = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
	setAttributes(arrowTop,{
		"points" : `${arrowX-12},${arrowY-0} ${arrowX+12},${arrowY-0} ${arrowX},${arrowY+30}`,
		"fill" : "white"
	})
	windVane.appendChild(arrowTop);

	let arrowBottom = document.createElementNS("http://www.w3.org/2000/svg", "rect");
	setAttributes(arrowBottom,{
		"x" : arrowX - 2,
		"y" : arrowY - 30,
		"width" : 5,
		"height" : 30,
		"fill" : "white"
	})
	windVane.appendChild(arrowBottom);

	// Circle to make wind vane look like a compass
	let whiteCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  setAttributes(whiteCircle,{
  	"cx": arrowX,
  	"cy": arrowY,
  	"r" : 40,
  	"stroke" : "white",
  	"stroke-width" : 5,
  	"fill" : "none"  	
	})
	windVane.appendChild(whiteCircle);

	// Air quality level
	// Circle around air quality
	let whiteCircle2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  setAttributes(whiteCircle2,{
  	"cx": 395,
  	"cy": -35,
  	"r" : 50,
  	"stroke" : "white",
  	"stroke-width" : 5,
  	"fill" : "white"
	})
	svg.appendChild(whiteCircle2);

	let words = ["Air","quality",data.airQualityIndex];
	for (let i=0; i<words.length; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : 395,
			"y" : -35-15 + i*25,
			"text-anchor" : "middle",
			"fill" : airQualityColor(data.airQualityIndex)
		})
		text.textContent = words[i];
		text.style.fontSize = "0.5em";
		text.style.fontWeight = "bold";
		svg.appendChild(text);
	}
	
	// Draw SVG
  document.getElementById("windGauge").innerHTML = "";
  document.getElementById("windGauge").appendChild(svg);
}


function airQualityColor(index) {
	let colors = ["00CCFF","0099CC","006699","FFCC0C","F9B03D","FF9832","FF6666","FF0000","CC0000","990000","660000"];

	if (index > colors.length) { // On the off chance it goes off scale
		index = colors.length
	}

	return "#" + colors[index-1]
}

// Display sun and moon data
function sunTimes(data) {
	// Size of SVG
	let width = 600, height = 240;
	let circle = {"x" : 400/2, "y" : height/2, "r" : 400/3*1.2};	// Centre x,y and radius and circumference
 	circle.c = 2*Math.PI*circle.r; // Needs to be computed separately because radius needs to be set first
	
	// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height, "viewBox" : "0 -90 400 240"});

  // Create grey background
  let background = document.createElementNS("http://www.w3.org/2000/svg", "circle")
  setAttributes(background,{
  	"stroke" : perc2color(0),
  	"opacity" : 0.7,
  	"stroke-dasharray" : `${circle.c/2}, ${circle.c}` // Dash length, space length
	},"arc",circle)
  svg.appendChild(background);

  let current_gmt = Date.now(); // Current time in milliseconds for position of Sun
  let midnight_gmt = new Date(current_gmt).setHours(0,0,0,0); // Midnight of beginning of day

 	let sunPercent = (current_gmt - midnight_gmt) / (24*60*60*1000); // Percentage of the day (so of the full arc of one day, not of sunlight hours arc)
  let sunrisePercent = (data.sunrise_gmt - midnight_gmt) / (24*60*60*1000);
  let sunsetPercent = (data.sunset_gmt - midnight_gmt) / (24*60*60*1000);

	let arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    setAttributes(arc,{
	  	"stroke" : "deepskyblue",	  	
	  	"stroke-dasharray" : `${circle.c/2*(sunsetPercent - sunrisePercent)}, ${circle.c}`, // Dash length, space length
	  	"stroke-dashoffset" : -circle.c/2 * sunrisePercent
		},"arc",circle)
	svg.appendChild(arc);

	// Sunrise and sunset time labels
	for (let i=0; i<=1; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : circle.x - circle.r*Math.sin(-Math.PI * [sunrisePercent,sunsetPercent][i] + Math.PI/2)*1.2,
			"y" : circle.y - circle.r*Math.cos(-Math.PI * [sunrisePercent,sunsetPercent][i] + Math.PI/2)*1.2,
			"text-anchor" : ["end","start"][i]
		})
		text.textContent = [data.sunrise_text,data.sunset_text][i];
		text.style.fontSize = "0.5em";
		svg.appendChild(text);
	}

	// Sun icon (only if visible, so between sunrise and sunset)
	if (sunPercent >= sunrisePercent && sunPercent <= sunsetPercent) {
		let sun = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		setAttributes(sun,{
			"cx" : circle.x - circle.r*Math.sin(-Math.PI * sunPercent + Math.PI/2)*1,
			"cy" : circle.y - circle.r*Math.cos(-Math.PI * sunPercent + Math.PI/2)*1,
			"r" : 20,
			"fill" : "yellow"		
		})
		svg.appendChild(sun);
	}

	// Moonrise and moonset
	let moonFactor = 0.75;
 	let moonPercent = (current_gmt - midnight_gmt) / (24*60*60*1000); // Percentage of the day (so of the full arc of one day, not of sunlight hours arc)
	let moonrisePercent = (data.moonRise - midnight_gmt) / (24*60*60*1000);
	let moonsetPercent = (data.moonSet - midnight_gmt) / (24*60*60*1000);

	// Drawing 3 arcs and hiding the arcs I don't need (midnight to first time, first to second time, second to midnight)
	let arcStops = [0,moonrisePercent,moonsetPercent,1];
	arcStops.sort(); // In case data.moonRise > data.moonSet
 	let opaqueFlag = 0; // Opacity of first arcs
 	if (data.moonRise > data.moonSet) { // Moon sets before rising -- need two intervals
		opaqueFlag = 1
	}

	for (let i=0; i<=2; i++) {
		if (opaqueFlag == 1) { // Opacity of 1 technically means it's opaque to background, so it IS visible!
			let moonArc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		  setAttributes(moonArc,{
		  	"stroke" : "indigo",
		  	"stroke-dasharray" : `${circle.c*moonFactor/2*(arcStops[i+1] - arcStops[i])}, ${circle.c*moonFactor}`, // Dash length, space length
		  	"stroke-dashoffset" : -circle.c*moonFactor/2 * arcStops[i],
		  	"r" : circle.r*moonFactor,
		  	"stroke-width" : 30,
			},"arc",circle)
			svg.appendChild(moonArc);

			// Moon icon (only if visible)
			if (moonPercent >= arcStops[i] && moonPercent <= arcStops[i+1]) {
				let x = circle.x - 1.06*circle.r*moonFactor*Math.sin(-Math.PI * moonPercent + Math.PI/2)*1;
				let y = circle.y - 1.06*circle.r*moonFactor*Math.cos(-Math.PI * moonPercent + Math.PI/2)*1;
			
				let moon = document.createElementNS("http://www.w3.org/2000/svg", "path");
				setAttributes(moon,{
					"d" : `M${x},${y} a8,8 0 1 0 8,10 a4,4 0 0 1 -9,-9`,
					"fill" : "lightgrey"
				})
				svg.appendChild(moon);
			}
		}
		opaqueFlag = 1 - opaqueFlag; // Next arc will have reverse opacity
	}

	// Moon phase
	let moonPic = document.createElementNS("http://www.w3.org/2000/svg", "image");
	setAttributes(moonPic,{
		"id" : "moonPic",
		"href" : data.moonPhase,
		"x" : circle.x - 50,
		"y" : circle.y - 75,
		"height" : 100,
		"width" : 100		
	})
	svg.appendChild(moonPic);

	// Draw SVG
  document.getElementById("sunGauge").innerHTML = "";
  document.getElementById("sunGauge").appendChild(svg);  	
}


// Set attributes for SVG graphics from a given attributes object rather than doing it stupidly one line at a time
function setAttributes(object, attributes, shape, circle) {
	// If a shape is given, use default values
	let defaults = {};
	if (shape == "arc") {
		defaults = {
	    "class" : "arc",
	  	"cx" : circle.x,
	  	"cy" : circle.y,
	  	"r" : circle.r,
	  	"fill" : "none",
	  	"stroke-width" : 55,
	  	"stroke-linecap" : "round",
	  }
	}

	// Set default values
	if (Object.keys(defaults).length != 0) {
		for (let key in defaults) {
    	object.setAttribute(key,defaults[key])
    }
	}

  // Any values given in attributes will override those set in defaults above based on shape name
  for (let key in attributes) {
    object.setAttribute(key,attributes[key])
  }
}


function perc2color(percentage) { // Percentage to color between green and red
	let r, g, b = 0;

	if (percentage == 0) { // Grey background
		r = g = b = 0;
	} else 	if (percentage < 0.5) {
		g = 255;
		r = Math.round(5.1 * percentage*100);
	} else {
		r = 255;
		g = Math.round(510 - 5.1 * percentage*100);
	}

	let h = r * 0x10000 + g * 0x100 + b * 0x1;

	return '#' + ('000000' + h.toString(16)).slice(-6);
}