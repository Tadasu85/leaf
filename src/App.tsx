import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import { z } from 'zod';

function App() {

	//We depend on keychain for signing and dhive for fetching data from the hive chain. 
	//Here we initializse them both.

	const hivenode = 'https://api.openhive.network'

	const client = useMemo(() => new Client([hivenode]), []);

	const keychain = useMemo(() => new KeychainSDK(window, {rpc:hivenode}), []);

	async function initializeKeychain() {
		await keychain.isKeychainInstalled();
	};

	window.onload = initializeKeychain();

	const gameGreeting =  [
		"If you've arrived here by accident and do not have a Hive account. ",
		"Please make your way to https://ecency.com/ to create an account.",
		"Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
		"If this is successful you will see your username in the top right." 
	];

	const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);	
	const [username, setUsername] = useState('');
	const [roomdata, setRoomData] = useState({});
	const [userProfileJSON, setuserProfileJSON] = useState({});
	const [gameJSON, setgameJSON] = useState({});
	const [userGreeted, setUserGreeted] = useState(false);
	const [isLoadedGame, setIsLoadedGame] = useState(false);
	const [isLoadedPlayer, setIsLoadedPlayer] = useState(false);
	const [isDisplayed, setisDisplayed] = useState(false);
	const [isSignedIn, setIsSignedIn] = useState(false);

	const fetchgameData = useCallback(async()  => {
		console.log("Fetch game data fired!");
		try {
			setIsLoadedGame(false);
			const gameInfo = await client.database.getAccounts(["hive-109456"]);
			const parsedgameInfo = JSON.parse(gameInfo[0].posting_json_metadata);
			setgameJSON(parsedgameInfo.egodeathgamedata.rooms_authors_exits);
			//console.log("From fetching gamedate:::", parsedgameInfo.egodeathgamedata.rooms_authors_exits);
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}, [client, setgameJSON]);

	const outPut = useCallback((texttooutput: string, bold?: boolean) => {
		setGameOutputMessage((prevOutput) => [...prevOutput, {output: texttooutput, bold: bold}]);
	}, []);

	const isEmpty = (obj) => Object.keys(obj).length === 0;

	// const displayRoom = useCallback(async() => {
	// 	console.log("Fired Displayroom!")
	// 	if(await roomdata && !isDisplayed) {
	// 		console.log("Met all criteria in display.")
	// 		outPut(roomdata.title, true);
	// 		outPut(roomdata.body, false);
	// 		if (!isEmpty(roomdata)) {
	// 			outPut("There is a way to leave: ", false); 
	// 		};
	// 		for(const exit in roomdata.exits) {
	// 			outPut(exit, true);
	// 		};
	// 	}
	// }, [roomdata, outPut, isDisplayed]);

	//I think this arbitrarily defines this function enough that it can be used to set player desc, as well as 
	//set the short desc and be used when we move the player!

	const updatePlayerData = useCallback(async(username: string, options?: {
		desc?: string,
		shortdesc?: string,
		newlocation?: {
			permlink: string,
			author: string
		}
	}) => {
		try {
			let currentMetadata = userProfileJSON;
			const currentPlayerData = currentMetadata.egodeathplayer || {}; 

			currentMetadata.egodeathplayer = {
				"Name": username,
				"Description": options?.desc ?? currentPlayerData.Description ?? "We really should define this but oh well.", 
				"ShortDesc": options?.shortdesc ?? currentPlayerData.ShortDesc ?? "How do you imagine we have a short if we don't a long?",
				"Location": options?.newlocation ?? currentPlayerData.Location ?? {"permlink":"genesis-scaffold-precipice", "author":"raymonjohnstone"}
			}; 

			delete currentMetadata.reputation;

			const broadcastData = {
				"username": username,
				"operations": [
					[
						"account_update2",
						{
							"account": username,
							"json_metadata": "",
							"posting_json_metadata": JSON.stringify(currentMetadata)
						}
					]
				],
				'method': KeychainKeyTypes.posting
			};
			await keychain.broadcast(broadcastData as unknown as Broadcast);
		} catch (error) {
			console.error('Error updating account metadata:', {error});
		}
	}, [keychain, userProfileJSON]);

	const fetchPlayerData = useCallback(async(username: string)  => {
		setIsLoadedPlayer(false);
		try {
			const accountInfo = await client.database.getAccounts([username]);
			if(!accountInfo[0].posting_json_metadata) {
				await updatePlayerData(username);
			} else {
				const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
				setuserProfileJSON(currentMetadata);
				const playerLocation = currentMetadata.egodeathplayer.Location;
				const transactionData = await client.database.call('get_content', [playerLocation.author, playerLocation.permlink]);
				for (const obj in gameJSON) {
					if (obj === playerLocation.permlink) {
						let foundexits = gameJSON[obj].exits;
						const obtaineddata = {
							"body":transactionData.body, 
							"title":transactionData.title,
							"exits": foundexits, 
							"author":playerLocation.author, 
							"permlink":playerLocation.permlink
						};
						setRoomData(obtaineddata);
						setisDisplayed(false);
					};
				};
			}
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}, [client, updatePlayerData, gameJSON]);

	const movePlayer = useCallback(async(username: string, permlink: string) => {
		try {
			const location = gameJSON[permlink];
			await updatePlayerData(username, {
				newlocation: {
					"permlink": permlink,
					"author": location.author
				}
			})
			await fetchPlayerData(username);
			setIsLoadedPlayer(true);
		} catch(error) {
			console.error(error);
		} finally {

		}
	}, [fetchPlayerData, gameJSON, updatePlayerData]);

	const handleTextEntered = useCallback(async(enteredText: string): enteredText => {
		const words = enteredText.toLowerCase().split(" ");
		const firstword = words[0];
		console.log(firstword);

		if (firstword === "login") {
			if(isSignedIn) {
				outPut("You are already signed in!", false);
			} else {
				const tempuser = enteredText.split(/\s+/)[1];
				setUsername(tempuser); 
      			outPut(`Logging in as ${tempuser}`, false); // Provide feedback to the user
      		}
      	} else if(isSignedIn) {
      		if(firstword === "@describe") {
      			const description = words.slice(1).join(" ");
      			const updateOptions = {
      				desc: description
      			};
      			await updatePlayerData(username, updateOptions);
      			outPut("Your description has been updated.", false);
      		}if(firstword === "@describeshort") {
      			const shortdescription = words.slice(1).join(" ");
      			const updateOptions = {
      				shortdesc: shortdescription
      			};
      			await updatePlayerData(username, updateOptions);
      			outPut("Your short description has been updated.", false);
      		}if(firstword === "look") {
      			outPut(roomdata.title, true);
      			outPut(roomdata.body, false);
      			if (!isEmpty(roomdata)) {
      				outPut("There is a way to leave: ", false); 
      			};
      			for(const exit in roomdata.exits) {
      				outPut(exit, true);
      			};
      			setisDisplayed(true);
      		}if(firstword in roomdata.exits) {
      			movePlayer(username, roomdata.exits[firstword]);
      			outPut(roomdata.title, true);
      			outPut(roomdata.body, false);
      			if (!isEmpty(roomdata)) {
      				outPut("There is a way to leave: ", false); 
      			};
      			for(const exit in roomdata.exits) {
      				outPut(exit, true);
      			};
      			setisDisplayed(true);
      		}
      	}
      }, [username, outPut, roomdata, updatePlayerData, movePlayer, isSignedIn]);

	const handleSignIn = useCallback(async(username: string) => {
		if(!isSignedIn) {
			const data: Login = {
				"username": username,
				"message": "{\"login\":\"123\"}",
					"method": KeychainKeyTypes.posting,
					"title": "Login"
				};

				try {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const login = await keychain.login(data as Login);
				} catch (error) {
					console.error("Login error:", error);
				} finally {
					setIsSignedIn(true);
				}
			}
		}, [keychain, isSignedIn]);

	const handleSignOut = () => {
		setIsSignedIn(false);
		setUsername('');
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const checkPlayer = useCallback(async(username: string) => {
		const playerSchema = z.object(
		{
			Name: z.string(),
			Description: z.string(),
			ShortDesc: z.string(),
			Location: z.object(),
		});

		function validatePlayerObject(playerObject: Object) {
			const result = playerSchema.safeParse(playerObject);
			return result.success;
		}
		try {
			if(!validatePlayerObject(userProfileJSON.egodeathplayer)){
				await updatePlayerData(username);
			}

		} catch(error) {
			console.error({ error })
		} finally {}
	}, [userProfileJSON, updatePlayerData]);

	if (!userGreeted && !isSignedIn) {
		gameGreeting.forEach((item, index) => {
			outPut(item, false);
		});
		setUserGreeted(true);
	};
	useEffect(() => {
		if (!isLoadedGame) {
			fetchgameData();
			setIsLoadedGame(true);
		}

	}, [isLoadedGame, fetchgameData]);

	useEffect(() => {
		if (username) {
			handleSignIn(username);
		}

	}, [username, handleSignIn]);

	useEffect(() => {
		if (isSignedIn && !isLoadedPlayer) {
			fetchPlayerData(username);
			setIsLoadedPlayer(true);
		}

	}, [isSignedIn, isLoadedPlayer, fetchPlayerData, username]);

	useEffect(() => {
		if (!isDisplayed && isLoadedPlayer) {
			outPut(roomdata.title, true);
			outPut(roomdata.body, false);
			if (!isEmpty(roomdata)) {
				outPut("There is a way to leave: ", false); 
			};
			for(const exit in roomdata.exits) {
				outPut(exit, true);
			};
		}
	}, [isDisplayed, isLoadedPlayer, outPut, roomdata]); 

	return (
		<div className="App">
		<header className="App-header">
		<div className="Title"> E̴̙̣̦̩̱̮͇̋̐̏̕G̶̱͕̦͎̯͙̳̋̽͒͋̾͌̌̚͜O̴̪̤͎̼͙̫͌̏͒̑̍̏͜͠ ̶̗͎̯̥̮̲̠̝̮̲̃͆͊̽Ḓ̶̘̞̂Ȇ̶̹͎͓̳̼͇̠͜ͅA̸͖͖̠̖̙̐̍̀̉̍̾̇̚Ṯ̷̜̀̆͗̏͊͘̚H̴̛̼ </div>
		<div className="SignOutButton">
		<SignOutButton isSignedIn={isSignedIn} username={username} onSignOut={handleSignOut} userProfileJSON={userProfileJSON} />
		</div>
		</header>
		<GameOutputWindow output={gameOutputMessage} />
		<div className="TextInputBox">
		<TextInputBox onEnterPressed={handleTextEntered} />
		</div>
		</div>
		);
}

export default App;