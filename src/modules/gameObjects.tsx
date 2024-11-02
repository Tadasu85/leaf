export default interface gameObjects {
	Player: {
		Name: string,
		Description: string,
		ShortDesc: string,
		Location: string,
		Stats: []
	},
	Room: {
		Name: string,
		Description: string,
		Post: string,
		Connections: [],
	}
}