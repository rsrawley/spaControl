// Set up message translation matrix (codes must be unique as they are used to store data in spa{})

module.exports.incoming = {
	"ff af 13" : { // Status update
		"description" : "Status udpate",
	
	//no ozone      17 03 67 0c 06 00 28 00 00 04 0c 00 00 02 00 00 00 00 02 06 64 00 00 00 1e 00 00
 //						    00 03 67 0c 07 00 28 00 00 04 0c 00 00 02 00 00 00 00 02 02 62 00 00 00 1e 00 00
//after wipe      17 03 67 0c 0e 00 28 00 00 04 0c 00 00 02 00 00 00 00 02 06 62 00 00 00 1e 00 00
//ff af 13        14 00 67 11 0e 00 00 67 67 04 0c 00 00 02 00 00 00 00 00 04 62 01 00 00 1e 00 00

						    //17 00 62 15 06 00 00 00 00 08 0c 00 00 02 00 00 00 00 00 04 60 00 00 00 1e 00 00
		"codeLine" : "GF PF CT HH MM HM 00 TA TB FC HF PP 00 CP LF 00 00 00 00 CF ST TC 00 00 H2 00 00".split(" "),
		"codes" : {
			"GF" : "General flag (05 = on hold)", // set to 17 without A/B temperature sensor activated, set to 14 otherwise???
			"PF" : "Priming flag (on start, goes through different stages: 04,42,05,01,00 ---0x01 = Priming)",
			"CT" : "Current temperature (in F) -- 00 means no temp reading", // verified
			"HH" : "Hours", // verified
			"MM" : "Minutes", // verified
			"HM" : "Heating mode (0x00 = Ready, 0x01 = Rest, 0x03?? = Ready in rest))", // verified for 0 and 1
			"TA" : "Temp sensor A (inlet) (show hold remaining time if on hold : goes to 3c (60 min) first, then drops by 1 every minute)", // verified
			"TB" : "Temp sensor B (outlet)", // verified
			"FC" : "Filter cycle (04(low)/06(high) = cycle 1, 08(high) = cycle 2, ?? = both?? FC goes to 00 briefly when switching?)", // verified
			"HF" : "Heat flag (0x04 = on hold in temp range high, 0x0c = not heating (high), 0x2c = waiting (high), 0x1c = heating (high), subtract 4 from all values for low range)", // verified
			"PP" : "Pump status (0x02 for pump 1, 0x08 for pump 2, 0x0a for both -- added together)", // verified
			"CP" : "Circ pump (0x00 = off, 0x02 = on)", // verified
			"LF" : "Light flag (0x03 for on)", // verified
			"CF" : "Cleanup cycle flag (0x04 off, 0x0c for on)",
			"ST" : "Set temperature", // verified
			"TC" : "Temperature A/B flag (0x00 = off, 0x01  = on)", // verified
			"H2" : "Heat mode 2nd flag (0x00 = when HM is 01, 0x1e = when HM is 00, also goes to 00 if M8 set to off and goes back to 1e if M8 set to on)" // could be timer on m8?
		}
	},

	"xx bf 23" : { // Filter configuration
		"description" : "Filter configuration",
		"codeLine" : "1H 1M 1D 1E 2H 2M 2D 2E".split(" "),
		"codes" : {
			"1H" : "Filter 1 start hour (always 0-24)",
			"1M" : "Filter 1 start minute",
			"1D" : "Filter 1 duration hours",
			"1E" : "Filter 2 duration minutes",
			"2H" : "Filter 2 start hour, masking out the high order bit, which is used as an enable/disable flag (mod 128)",
			"2M" : "Filter 2 start minute",
			"2D" : "Filter 2 duration hours",
			"2E" : "Filter 2 duration minutes"
		}
	},

	"xx bf 24" : { // Control configuration 1 ***seems same as ff af 26***!!!!!!!
		"description" : "Control configuration 1",
						 	 // 64 c9 2c 00 4d 42 50 35 30 31 55 58 03 a8 2f 63 83 01 06 05 00
		"codeLine" : "00 00 00 00 B1 B2 B3 B4 B5 B6 B7 B8 00 00 00 00 00 00 00 00 00".split(" "),
		"codes" : {
			"B1 to B8" : "Motherboard model in ASCII"
		}
	},

	"xx bf 25" : { // Control configuration 2
		"description" : "Control configuration 2",
						 	 // 09 03 32 63 50 68 49 03 41 02
		"codeLine" : "00 00 00 00 00 00 00 00 00 00".split(" "),
		"codes" : {
		}
	},

	"xx bf 26" : { // Control configuration 3
		"description" : "Control configuration 3",
						 	 // 00 87 00 01 00 01 00 00 01 00 00 00 00 00 00 00 00 00
		"codeLine" : "00 00 RM TS TF CC 00 00 M8 00 00 00 00 00 00 00 00 00".split(" "),
		"codes" : {
			"RM" : "Reminders (0 = on, 1 = off)",
			"TS" : "Temperature scale (0 = Fahrenheit, 1 = Celsius)",
			"M8" : "M8 artificial intelligence (0 = off, 1 = on)",
			"TF" : "Time format flag (0 = 12h, 1 = 24h)",
			"CC" : "Cleaning cycle length (0 to 8, each integer is 0.5h increments)"
		}
	},

	"xx bf 2e" : { // Control configuration 4
		"description" : "Control configuration 4",
						 	 // 05 00 01 90 00 00
	},

	"xx bf 28" : { // Faults log
		"description" : "Faults log",
						 	 // 0c 0a 10 55 17 21 10 64 60 66
		"codeLine" : "TO EN EC ND FH FM FE FS FA FB".split(" "),
		"codes" : {
			"TO" : "Total number of entries", // verified
			"EN" : "Entry number (add one to hex number)", // verified
			"EC" : "Error code (see Spa Touch manual for list)", // verified
			"ND" : "Number of days ago", // verified
			"FH" : "Time (hour) of fault", // verified
			"FM" : "Time (minute) of fault", // verified
			"FE" : "Heat mode (01 = ready)", // verified
			"FS" : "Set temp", // verified
			"FA" : "Temp A", // verified
			"FB" : "Temp B" // verified
		}
	},

	"xx bf 2b" : { // GFCI test result
		"description" : "GFCI test result",
						 	 // 01
		"codeLine" : "GF".split(" "),
		"codes" : {
			"GF" : "GFCI test result (0 = not passed, 1 = passed)", // verified
		}
	}
}
