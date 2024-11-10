export default interface gameObjects {
{"Player": {
		"Name": string,
		"PreviousId": string,
		"Description": string,
		"ShortDesc": string,
		"Location": string,
},
{"Room": {
		"PreviousId": string,
		"ReferencePost": string,
		"Connections": [],
		"Players":[]
}
}
