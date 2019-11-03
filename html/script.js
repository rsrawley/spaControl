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

// Set up parameters
let settings = [
	["Priming: ","PF"],
	["Current temperature: ","CT"],
	["Hours: ","HH"],
	["Minutes: ","MM"],
	["Heating mode: ","HF"],
	["Temp sensor A: ","TA"],
	["Temp sensor B: ","TB"],
	["Filter cycle: ","FC"],
	["Pump status: ","PP"],
	["Circulation pump: ","CP"],
	["Lights: ","LF"],
	["Cleanup cycle: ","CC"],
	["Temperature scale: ","F3"],
	["Set temperature: ","ST"],
	["Heat mode: ","H2"],

	["Filter 1 start hour (always 0-24): ","1H"],
	["Filter 1 start minute: ","1M"],
	["Filter 1 duration hours: ","1D"],
	["Filter 2 duration minutes: ","1E"],
	["Filter 2 start hour: ","2H"],
	["Filter 2 start minute: ","2M"],
	["Filter 2 duration hours: ","2D"],
	["Filter 2 duration minutes: ","2E"]
];

for (let i=0; i<settings.length; i++) {
	let element = document.createElement("div");
	element.innerHTML = settings[i][0];
	
	let span = document.createElement("span");
	span.id = settings[i][1];
	element.appendChild(span);
	
	document.getElementById("settings").appendChild(element);
}


// Add toggle buttons
let toggles = ["pump1","pump2","light","heatMode","tempRange"];
for (let i=0; i<toggles.length; i++) {
	let button = document.createElement("button");
	button.innerHTML = toggles[i];
	
	button.addEventListener("click", function(){
		sendValue("toggleItem",toggles[i]);
	});
	
	document.getElementById("toggles").appendChild(button);
}

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
	if (document.getElementById(data.id)) {
		if (data.id == "2H") { // Filter start hour also has on/off info
			// filter 2 cycle on(1) or off(0)
			let filter2 = Math.floor(parseInt(data.value,16)/128) // this is not displayed right now
			data.value = (parseInt(data.value,16) % 128).toString(16) // mod 128 to take out high bit
		}

		document.getElementById(data.id).innerHTML = parseInt(data.value,16) + " (0x" + data.value + ")";
	}
})


// Send data to node server
function sendValue(type,param) {
	//console.log(type,param)
	socket.emit('command',{"type" : type, "param" : param});
}