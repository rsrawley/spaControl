// Reference for radio toggle CSS : https://codepen.io/JiveDig/pen/jbdJXR/

drawHourly(); // Hourly forecast table

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


function drawHourly() {	
	let grid = document.getElementById("weatherForecast");

	let params = ["hour","temperature","feelsLike","wind","windDir","windGust","POP","rain","snow"];
	let units = ["","°C","°C","km/h","","km/h","%","mm","cm"];

	for (let row=0; row<6; row++) {
		for (let col=0; col<params.length; col++){
			let cell = document.createElement("div");
			let span = document.createElement("span");
			span.id = params[col] + row;
			cell.appendChild(span);
			cell.innerHTML += "&nbsp;" + units[col];
			grid.appendChild(cell);
		}

		// Weather icon div (insert right after hour (0th child node) and so before 1st child node)
		let iconDiv = document.createElement("div");
		let icon = document.createElement("img");
		icon.id =  "icon" + row;
		icon.width = 50;	
		iconDiv.appendChild(icon);		
		grid.insertBefore(iconDiv,grid.children[(row+1)*(params.length+1) + 1]);
	}
}