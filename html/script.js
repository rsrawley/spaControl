// Reference for radio toggle CSS : https://codepen.io/JiveDig/pen/jbdJXR/

// Set up radio toggle buttons
let radioToggles = {
	"tempScale" : {
		"display" : "Temperature scale: ",
		"id" : ["TS_0", "TS_1"],
		"label" : ["&deg;F","&deg;C"],
		"func" : function() {
			if (document.getElementById("TS_0").checked) {
				sendValue('setTempScale','1')
			} else {
				sendValue('setTempScale','0')
			}
		}
	},

	"reminders" : {
		"display" : "Reminders: ",
		"id" : ["RM_0", "RM_1"],
		"label" : ["ON","OFF"],
		"func" : function() {
			if (document.getElementById("RM_0").checked) {
				sendValue('setReminders','1')
			} else {
				sendValue('setReminders','0')
			}
		}
	},

	"M8" : {
		"display" : "M8: ",
		"id" : ["M8_1", "M8_0"],
		"label" : ["ON","OFF"],
		"func" : function() {
			if (document.getElementById("M8_0").checked) {
				sendValue('setM8','1')
			} else {
				sendValue('setM8','0')
			}
		}
	},

	"timeFormat" : {
		"display" : "Time format: ",
		"id" : ["TF_0", "TF_1"],
		"label" : ["12h","24h"],
		"func" : function() {
			if (document.getElementById("TF_0").checked) {
				sendValue('setTimeFormat','1')
			} else {
				sendValue('setTimeFormat','0')
			}
		}
	},

	"tempRange" : {
		"display" : "Temperature range: ",
		"id" : ["HF_0", "HF_1"], // this is not clear if this is right code
		"label" : ["HIGH","LOW"],
		"func" : function() {sendValue('toggleItem','tempRange')}
	},

	"cleaningCycle" : {
		"display" : "Cleaning cycle: ",
		"id" : ["CC_0","CC_1","CC_2","CC_3","CC_4","CC_5","CC_6","CC_7","CC_8",], // this is not clear if this is right code
		"label" : ["OFF","0.5 h","1 h","1.5 h","2 h","2.5 h","3 h","3.5 h","4 h","4.5 h"]
	}
};

for (let key in radioToggles) {
	let div = document.createElement("div");
	div.className = "switch-field"; // Apply CSS
	div.innerHTML = radioToggles[key].display;

	for (let i=0; i<radioToggles[key].id.length; i++) {
		let radioToggleswitch = document.createElement("input");
		radioToggleswitch.type = "radio";
		radioToggleswitch.id = radioToggles[key].id[i];
		radioToggleswitch.name = key + "_name"; // They all need the same name
		radioToggleswitch.disabled = true; // So that clicking doesn't change display, only input from hot tub
		div.appendChild(radioToggleswitch);

		let label = document.createElement("label");
		label.htmlFor = radioToggles[key].id[i];
		label.innerHTML = radioToggles[key].label[i];
		label.onclick = radioToggles[key].func;
		div.appendChild(label);
	}

	document.getElementById("settingsRadioButtons").appendChild(div);
}

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
			document.getElementById(key).innerHTML = data.value.current[key]
console.log(key)
		}
		let wind = data.value.current.wind;
		let windGust = data.value.current.windGust;
		drawGauge("windGauge",0,30,[windGust,wind],["wind " + wind,"gust " + windGust,"km/h"]);

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




// hot tub is pointing at 320 deg -- take that into account for diagram of wind dir !



function drawGauge(elementID,min,max,value,words) {
	// also for reference : https://www.hongkiat.com/blog/svg-meter-gauge-tutorial/

	// elementID : ID of HTML element in DOM
	// min/max : minimum/maximum value of gauge
	// value : array of actual reading on gauge (array for multiple values; listed from biggest to smallest)	
	// words : array of lines of text to add in center of gauge
	let width = 400, height = 400;
	let circle = {"x" : width/2, "y" : height/2, "r" : 150};	// Centre x,y and radius

		// Create the SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  
  // Set width and height
  setAttributes(svg, {"width" : width, "height" : height});
 
  // Create grey background
  svg.appendChild(traceArcPath(perc2color(0),1,circle.x,circle.y,circle.r,circle.x + circle.r,circle.y));

  // Create colored arcs
  for (let i=0; i < value.length; i++) {
  	if (value[i] > max) { // Put at maximum if out of range
  		value[i] = max
  	}
  	let percentage = value[i] / (max-min);
		let angle = percentage * Math.PI - Math.PI/2; // Angle in radians (-90 to go from -90 to +90 rather than 0 to 180)
	  let final = {
	  	"x" : circle.r * Math.sin(angle) + circle.x,
	  	"y" : circle.y - circle.r * Math.cos(angle)
	  }

	  let opacity = 1;
	  if (i == 0) {
	  	opacity = 0.3
	  }

	  svg.appendChild(traceArcPath(perc2color(percentage),opacity,circle.x,circle.y,circle.r,final.x,final.y));
	}

	// Add min and max
	let params = [[circle.x - circle.r,min] , [circle.x + circle.r,max]]
	for (let i=0; i<params.length; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"text-anchor" : "middle",
			"x" : params[i][0],
			"y" : circle.y+30,
		})
		text.textContent = params[i][1];
		text.style.fontSize = "0.5em";
		svg.appendChild(text);
	}

	// Add text in centre of gauge
	for (let i=0; i<words.length; i++) {
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		setAttributes(text,{
			"text-anchor" : "middle",
			"x" : circle.x,
			"y" : circle.y+i*40-50,
		})
		text.textContent = words[i];
		text.style.fontSize = "0.8em";
		svg.appendChild(text);
	}

	// Draw SVG
  document.getElementById(elementID).innerHTML = "";
  document.getElementById(elementID).appendChild(svg);
}


function setAttributes(object, attributes) {
  // Set attributes for SVG graphics from a given attributes object rather than doing it stupidly one line at a time
  for (let key in attributes) {
    object.setAttribute(key,attributes[key])
  }
}


function traceArcPath(colour,opacity,Cx,Cy,R,Ax,Ay) {
	// Cx, Cy : circle centre coordinates
	// R : radius
	// Ax, Ay : final x and y values for arc
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  
  let arc = "M " + (Cx - R) + " " + Cy; // "Move to"  	
  arc += "A " + R + " " + R;
  arc += ",0,0,1,";
  arc += Ax + " " + Ay;

  setAttributes(path, {
  	"d" : arc,
  	"stroke" : colour,
  	"fill" : "none",
  	"stroke-width" : 60,
  	"opacity" : opacity
  })

  return path
}

function perc2color(percentage) { // Percentage to color between green and red
	let r, g, b = 0;

	if (percentage == 0) { // Grey background
		r = 127
		g = 127
		b = 127
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