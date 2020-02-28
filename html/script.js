// Add event listeners
// Set temperature buttons
document.getElementById("setMinus").onclick = function() {sendValue('setTemp',Number(document.getElementById("ST").innerHTML) - 1)};
document.getElementById("setPlus").onclick = function() {sendValue('setTemp',Number(document.getElementById("ST").innerHTML) + 1)};

// Control buttons
document.getElementById("lights").onclick = function() {sendValue('toggleItem','lights')};
document.getElementById("jets1").onclick = function() {sendValue('toggleItem','pump1')};
document.getElementById("jets2").onclick = function() {sendValue('toggleItem','pump2')};


// Add event listeners
document.getElementById("setTempButton").addEventListener("click", function(){
	sendValue("setTemp", document.getElementById("setTemp").value);
});


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


// Receive data websockets
socket.on('data',function(data) {
	//console.log(data);
	if (data.id == "weather") {
		// Current observations
		for (let key in data.value.current) {
			let id = document.getElementById(key);
			if (id) {
				document.getElementById(key).innerHTML = data.value.current[key]
			}
		}

		// Temperature gauge values
		temperatureGauge(Number(data.value.current.temperature),Number(data.value.current.feelsLike),Number(data.value.current.low),Number(data.value.current.high))

		// Wind gauge values
		let wind = Number(data.value.current.wind);
		let windGust = Number(data.value.current.windGust);
		let windAngle = ["N","NE","E","SE","S","SW","W","NW"].indexOf(data.value.current.windDir) * 360/8 + 40; // Offset of 40deg is relative to where hot tub is pointing compared to true north
		windGauge([windGust,wind,windAngle],["wind " + wind,"gust " + windGust,"km/h"]);

		// Hourly forecast
		for (let key in data.value.hourly) {
			for (let i=0; i<6; i++) {
				if (key != "icon") {
					document.getElementById(key + i).innerHTML = data.value.hourly[key][i]
				} else {
					document.getElementById("icon" + i).src = data.value.hourly[key][i]
				}
			}
		}

	} else {

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
		}
		
		if (document.getElementById(data.id)) { // id exists ?
			if (["CT","HH","MM","ST","TA","TB"].includes(data.id)) {
				document.getElementById(data.id).innerHTML = parseInt(data.value,16).toString().padStart(2,"0"); // Change hex to decimal
			} else if ([""].includes(data.id)) {
				document.getElementById(data.id).innerHTML = data.value;
			}
		}
	}
})


// Send data to node server
function sendValue(type,param) {
	//console.log(type,param)
	socket.emit('command',{"type" : type, "param" : param});
}


// Draw graph
google.charts.load('current', {'packages':['corechart']})
socket.on('graphData',function(graphData) {
	google.charts.setOnLoadCallback(function(){drawChart(graphData)})
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
	graphData.unshift(['Time','Spa','Outdoor','Heating'])

	// Chart data and options
	let data = google.visualization.arrayToDataTable(graphData)

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
			2: {format:'decimal', viewWindow:{min:0, max:1}, gridlines:{count:0}, textPosition: 'none', viewWindow:{min:0.1}}
		}
	}

	let chart = new google.visualization.ComboChart(document.getElementById('graph'))
  chart.draw(data, options)		
}


function temperatureGauge(temperature,feelsLike,low,high) {
	// Size of SVG and max values to represent
	let width = 440, height = 480;

	// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height});
  //setAttributes(svg, {"viewBox" : "-80 0 600 400"});

  // Sets definitions for rainbow gradient
  let defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
 	svg.appendChild(defs);
  let rainbowGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  rainbowGradient.id = "rainbowGradient";
  setAttributes(rainbowGradient,{"x1":"0%" , "y1":"100%" , "x2":"0%" , "y2":"0%"});
  defs.appendChild(rainbowGradient);

	let rainbow=["238,130,238","75,0,130","71,174,230","0,255,0","255,255,0","255,127,0","255,0,0"]
  for (let i=0; i<rainbow.length; i++) {
  	let stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  	rainbowGradient.appendChild(stop);
 	  setAttributes(stop,{
 	  	"offset" : `${i*100/(rainbow.length-1)}%`,
 	  	"stop-color" : `rgb(${rainbow[i]})`
 	  })
  }

  let highLowGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  highLowGradient.id = "highLowGradient";
  setAttributes(highLowGradient,{"x1":"0%" , "y1":"100%" , "x2":"0%" , "y2":"0%"});
  defs.appendChild(highLowGradient);

	let highLow=["0,0,255","255,0,0"];
  for (let i=0; i<highLow.length; i++) {
  	let stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  	highLowGradient.appendChild(stop);
 	  setAttributes(stop,{
 	  	"offset" : `${i*100/(highLow.length-1)}%`,
 	  	"stop-color" : `rgb(${highLow[i]})`
 	  })
  }

  let min = -35, max = 35; // Minimum and maximum temperatures to be represented on the scale
  let range = max - min;

	// Draw solid black background
	let solid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  setAttributes(solid,{
  	"x" : 110,
  	"y" : 40,
  	"width" : 100,
  	"height" : 400,
  	"fill": "black"
	})
	svg.appendChild(solid);
	
	let temps = [temperature,feelsLike];
 	for (let i=0; i<temps.length; i++) {
		// In case temperatures out of bounds
	  let percent = (temps[i] - min) / range;
  	if (temps[i] > max) {
	  	percent = 1
	  } else if (temps[i] < min) {
	  	percent = 0
	  }

		// Draw full rainbow line
		let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
	  setAttributes(line,{
	  	"x1" : 135+i*50,
	  	"y1" : 40,
	  	"x2" : 135+i*50+0.001, // .001 otherwise horizontal gradient line doesn't show
	  	"y2" : 440,
	  	"stroke": "url(#rainbowGradient)",
	  	"stroke-width" : 50,
	  	"stroke-dasharray" : "5,2",
	  	"opacity" : [1,0.8][i]
		})
		svg.appendChild(line);

		// Hide the part that is beyond the temperature
  	let black = document.createElementNS("http://www.w3.org/2000/svg", "line");
	  setAttributes(black,{
	  	"x1" : 135+i*50,
	  	"y1" : 40,
	  	"x2" : 135+i*50,
	  	"y2" : 40 + (1-percent) * 400,
	  	"stroke": "black",
	  	"stroke-width" : 50,
	  	"opacity" : 0.75
		})
		svg.appendChild(black);

		// Add temperature labels
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : 100+i*120,
			"y" : 40 + (1-percent) * 400,
			"text-anchor" : ["end","start"][i],
			"fill" : "white",
			"dominant-baseline" : "central"
		})
		text.textContent = temps[i] + " °C";
		text.style.fontSize = "0.7em";
		svg.appendChild(text);

		// Add "Outdoor" and "Feels like" labels
		let labels = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(labels,{
			"x" : 100+i*120,
			"y" : 10 + (1-percent) * 400,
			"fill" : "white",
			"text-anchor" : ["end","start"][i],
			"dominant-baseline" : "middle"
		})
		labels.textContent = ["Outdoor","Feels like"][i];
		labels.style.fontSize = "0.5em";
		svg.appendChild(labels);
	}

	// If low same as high, range will cause divide by zero
	let rangeHighLow = high - low;
	if (low == high) {
		rangeHighLow = 1; // Avoid division by zero
	}
	
	// In case temperatures out of bounds
  let percent = (temperature - low) / rangeHighLow;
	if (temperature > high) {
  	percent = 1
  } else if (temperature < low) {
  	percent = 0
  } else if (rangeHighLow == 1 && temperature == low) { // Super special situation !
  	percent = 1
  }

	// Draw solid background
	let solid2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  setAttributes(solid2,{
  	"x" : 380,
  	"y" : 40,
  	"width" : 40,
  	"height" : 400,
  	"fill": "black"
	})
	svg.appendChild(solid2);

	// Draw full high low gradient
	let line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  setAttributes(line2,{
  	"x1" : 400,
  	"y1" : 40,
  	"x2" : 400.001, // .001 otherwise horizontal gradient line doesn't show
  	"y2" : 440,
  	"stroke": "url(#highLowGradient)",
  	"stroke-width" : 40,
  	"stroke-dasharray" : "5,2"
	})
	svg.appendChild(line2);

	// Hide the part that is beyond the temperature
	let black = document.createElementNS("http://www.w3.org/2000/svg", "line");
  setAttributes(black,{
  	"x1" : 400,
  	"y1" : 40,
  	"x2" : 400,
  	"y2" : 40 + (1-percent)*400,
  	"stroke": "black",
  	"stroke-width" : 40,
  	"opacity" : 0.6
	})
	svg.appendChild(black);

	// Add high and low temps
	for (let i=0; i<=1; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : 400,
			"y" : 35 + i*410,
			"text-anchor" : "middle",
			"fill" : "white",
			"dominant-baseline" : ["baseline","hanging"][i]
		})
		text.textContent = [high,low][i] + " °C";
		text.style.fontSize = "0.5em";
		svg.appendChild(text);
	}
	
  document.getElementById("temperatureGauge").innerHTML = "";
  document.getElementById("temperatureGauge").appendChild(svg);
}

// google search : how to get rgb color of linear gradient svg js
// https://stackoverflow.com/questions/23276926/how-to-get-color-of-svg-rainbowGradient-at-specific-position

//setRGB()
// Gives a color based on a given temperature for feels like temperature
function setRGB(temperature) { // delete this entire function !!!!!!!!!!!!
	const lowestTemp = -35, highestTemp = 40;
	let range = highestTemp - lowestTemp;

	// 3 sine waves 120 degrees out of phase
	let red   = Math.floor(Math.sin(2*Math.PI*(temperature/(range+1) + 0/3 + 0.8)) * 127) + 128;
	let	green = Math.floor(Math.sin(2*Math.PI*(temperature/(range+1) + 1/3 + 0.8)) * 127) + 128;
	let	blue  = Math.floor(Math.sin(2*Math.PI*(temperature/(range+1) + 2/3 + 0.8)) * 127) + 128;

//	return "#" + red.toString(16).padStart(2, '0') + green.toString(16).padStart(2, '0') + blue.toString(16).padStart(2, '0')


	div=document.getElementById('test')
	let phase = 0.8;

	for (let i=-30; i<=highestTemp; i=i+2) {
		red   = Math.floor(Math.sin(2*Math.PI*(i/(range+1) + 0/3 + phase)) * 127) + 128; // 3 sine waves 120 degrees out of phase
		green = Math.floor(Math.sin(2*Math.PI*(i/(range+1) + 1/3 + phase)) * 127) + 128;
		blue  = Math.floor(Math.sin(2*Math.PI*(i/(range+1) + 2/3 + phase)) * 127) + 128;

	  let span = document.createElement("span")
	  span.innerHTML=String.fromCharCode(95+i);
	  span.style.fontSize="15px"
	  span.style.backgroundColor = "#"+red.toString(16).padStart(2, '0')+green.toString(16).padStart(2, '0')+blue.toString(16).padStart(2, '0')
	  //console.log(String.fromCharCode(95+i),red,green,blue,span.style.backgroundColor)
	  div.appendChild(span)
	}
}


function windGauge(values,words) {
	// Size of SVG and max values to represent on wind scale
	let width = 400, height = 400, min = 0, max = 32;
	let circle = {"x" : width/2, "y" : height/2, "r" : width/3*1.2};	// Centre x,y and radius and circumference
 	circle.c = 2*Math.PI*circle.r; // Needs to be computed separately because radius needs to be set first
	
	// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height});

  // Create grey background
  let background = document.createElementNS("http://www.w3.org/2000/svg", "circle")
  setAttributes(background,{
  	"cx" : circle.x,
  	"cy" : circle.y,
  	"r" : circle.r,
  	"stroke" : perc2color(0),
  	"opacity" : 0.7,
  	"fill" : "none",
  	"stroke-width" : 55
	})
  svg.appendChild(background);
  
  // Create colored arcs
  let opacity = [1, 1]; // Opacity of arcs (first is gust, second is wind)
  for (let i=0; i <=1; i++) {
  	if (values[i] > max) { // Put at maximum if out of range
  		values[i] = max
  	}

  	let percentage = values[i] / max;
  	let arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    setAttributes(arc,{
    	"class" : "arc",
	  	"cx" : circle.x,
	  	"cy" : circle.y,
	  	"r" : circle.r,
	  	"stroke" : perc2color(percentage),
	  	"fill" : "none",
	  	"stroke-width" : 55,
	  	"opacity" : opacity[i],
	  	"stroke-linecap" : "round",
	  	"stroke-dasharray" : `${circle.c*percentage}, ${circle.c}` // Dash length, space length
		})
		svg.appendChild(arc);
	}

	// Add text in centre of gauge
	for (let i=0; i<words.length; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"x" : circle.x,
			"y" : circle.y+i*40-25,
			"text-anchor" : "middle"
		})
		text.textContent = words[i];
		text.style.fontSize = "0.8em";
		svg.appendChild(text);
	}

	// Add wind direction pointer
	let windVane = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
	windVane.id = "windVane";
	setAttributes(windVane,{
		"points" : `${circle.x-5},${circle.y-circle.r-45} ${circle.x+15},${circle.y-circle.r-45} ${circle.x},${circle.y-circle.r-5}`,
		"fill" : "white"
	})
	windVane.style.transform = `rotate(${values[2]}deg)`; // Rotate it according to wind direction
	svg.appendChild(windVane);

	// North direction (text "N")
	let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
	setAttributes(text,{
		"x" : 345,
		"y" : 41,
		"text-anchor" : "middle"
	})
	text.textContent = "N";
	text.style.fontSize = "0.8em";
	svg.appendChild(text);

	// Draw SVG
  document.getElementById("windGauge").innerHTML = "";
  document.getElementById("windGauge").appendChild(svg);
}


function setAttributes(object, attributes) {
  // Set attributes for SVG graphics from a given attributes object rather than doing it stupidly one line at a time
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