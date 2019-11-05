// Reference for radio toggle CSS : https://codepen.io/JiveDig/pen/jbdJXR/
/*		Temperature scale: <span id="tempScale"></span><br>
		Reminders: on/off(toggle switch)<br>
		M8: on/off(toggle switch)<br>
		Time format: 12h / 24h(toggle)<br>
		Temperature range: low/high(toggle)<br>
*/
// Set up radio toggle buttons
let radioToggles = {
	"tempScale" : {
		"display" : "Temperature scale: ",
		"id" : ["TS_0", "TS_1"],
		"label" : ["&deg;F","&deg;C"]
	},

	"reminders" : {
		"display" : "Reminders: ",
		"id" : ["RM_0", "RM_1"],
		"label" : ["ON","OFF"]
	},

	"M8" : {
		"display" : "M8: ",
		"id" : ["M8_1", "M8_0"],
		"label" : ["ON","OFF"]
	},

	"timeFormat" : {
		"display" : "Time format: ",
		"id" : ["TF_0", "TF_1"],
		"label" : ["12h","24h"]
	},

	"tempRange" : {
		"display" : "Temperature range: ",
		"id" : ["HF_0", "HF_1"], // this is not clear if this is right code
		"label" : ["HIGH","LOW"]
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
		div.appendChild(radioToggleswitch);

		let label = document.createElement("label");
		label.htmlFor = radioToggles[key].id[i];
		label.innerHTML = radioToggles[key].label[i];
		div.appendChild(label);
	}

	document.getElementById("settingsRadioButtons").appendChild(div);
}

// Add event listeners
document.getElementById("lights").onclick = function() {sendValue('toggleItem','lights')};
document.getElementById("jets1").onclick = function() {sendValue('toggleItem','pump1')};
document.getElementById("jets2").onclick = function() {sendValue('toggleItem','pump2')};


// Add event listeners
document.getElementById("setTempButton").addEventListener("click", function(){
	sendValue("setTemp", document.getElementById("setTemp").value);
});


// Special buttons
function letsgo() {
	if (parseInt(document.getElementById("LF").innerHTML,10) != 3) { // Lights not on?
		sendValue("toggleItem","light");
	}
	sendValue("setTemp","100");
}

function alldone() {
	console.log(document.getElementById("LF").innerHTML,typeof(document.getElementById("LF").innerHTML),document.getElementById("LF").innerHTML == 3)
	if (parseInt(document.getElementById("LF").innerHTML,10) == 3) { // Lights on?
		sendValue("toggleItem","light");
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

	if (data.id == "HF") { // Heat flag
		let heat = {"04" : "On hold", "0c" : "Not heating", "2c" : "Waiting", "1c" : "Heating", // High range
								"00" : "On hold", "08" : "Not heating", "??" : "Waiting", "??" : "Heating"}; // Low range
		if (data.value in heat) {
			data.value = heat[data.value]
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
	}

	if (document.getElementById(data.id)) { // id exists ?
		if (["CT","HH","MM","ST"].includes(data.id)) {
			document.getElementById(data.id).innerHTML = parseInt(data.value,16); // Change hex to decimal
		} else if (["HF"].includes(data.id)) {
			document.getElementById(data.id).innerHTML = data.value;
		}
	}
})


// Send data to node server
function sendValue(type,param) {
	//console.log(type,param)
	socket.emit('command',{"type" : type, "param" : param});
}