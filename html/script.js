// Set up parameters
let settings = [
	["Priming: ","F1"],
	["Current temperature: ","CT"],
	["Hours: ","HH"],
	["Minutes: ","MM"],
	["Heating mode: ","F2"],
	["Temperature scale: ","F3"],
	["Heating: ","F4"],
	["Pump status: ","PP"],
	["Circulation pump: ","CP"],
	["Lights: ","LF"],
	["Set temperature","ST"]
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


// socket.io functions
let socket = io();

socket.on('error',function(error) {
	document.getElementById("error").innerHTML = error;
})


socket.on('data',function(data) {
	console.log(data);
	document.getElementById(data.id).innerHTML = data.value;
})


// Send data to node server
function sendValue(type,param) {
	socket.emit('command',{"type" : type, "param" : param});
}