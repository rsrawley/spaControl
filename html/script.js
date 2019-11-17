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


// How to display data on the screen


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
	}
	
	if (document.getElementById(data.id)) { // id exists ?
		if (["CT","HH","MM","ST","TA","TB"].includes(data.id)) {
			document.getElementById(data.id).innerHTML = parseInt(data.value,16); // Change hex to decimal
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