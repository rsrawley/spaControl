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