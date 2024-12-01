import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import { z } from 'zod';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import gameObjects from './modules/gameObjects';


function App() {

	const hivenode = 'https://api.hive.blog'

	const client = useMemo(() => new Client([hivenode]), []);

	const keychain = useMemo(() => new KeychainSDK(window, {rpc:hivenode}), []);

	async function initializeKeychain() {
		await keychain.isKeychainInstalled();
	};

	window.onload = initializeKeychain();

	const gameGreeting = [
		"If you've arrived here by accident and do not have a Hive account. ",
		"Please make your way to https://ecency.com/ to create an account.",
		"Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
		"If this is successful you will see a button on the top right which shows your username." 
		];

	const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [errorMessage, setErrorMessage] = useState(null);
	const [username, setUsername] = useState('');
	const [roomdata, setRoomData] = useState({});
	const [userProfileJSON, setuserProfileJSON] = useState({});
	const [gameJSON, setgameJSON] = useState({});
	const [userGreeted, setUserGreeted] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoaded, setisLoaded] = useState(false);
	const [isSignedIn, setIsSignedIn] = useState(false);

	const outPut = (texttooutput: string, bold?: boolean) => {
		setGameOutputMessage((prevOutput) => [...prevOutput, {output: texttooutput, bold: bold}]);
	};

	const fetchData = useMemo(() => async () => {
		setIsLoading(true);
		setErrorMessage(null);
		try {
			const accountInfo = await client.database.getAccounts([username]);
			const gameInfo = await client.database.getAccounts(["hive-109456"]);
			const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
			const parsedgameInfo = JSON.parse(gameInfo[0].posting_json_metadata);
			setuserProfileJSON(currentMetadata);
			setgameJSON(parsedgameInfo.egodeathgamedata.rooms_authors_exits);
			const playerLocation = currentMetadata.egodeathplayer.Location;
			const transactionData = await client.database.call('get_content', [playerLocation.author, playerLocation.permlink]);
			for (const obj in parsedgameInfo.egodeathgamedata.rooms_authors_exits) {
				if (obj === playerLocation.permlink) {
					let foundexits = parsedgameInfo.egodeathgamedata.rooms_authors_exits[obj].exits;
					const obtaineddata = {
						"body":transactionData.body, 
						"title":transactionData.title, 
						"exits": foundexits, 
						"author":playerLocation.author, 
						"permlink":playerLocation.permlink
					};
					setRoomData(obtaineddata);
				};
			};
			setisLoaded(true);
		} catch (error) {
			setErrorMessage('Error fetching data.');
			console.error('Error fetching data:', error);
		} finally {
			setIsLoading(false);
		}		
	}, [client.database, username, setgameJSON]);

	if (!userGreeted && !isSignedIn) {
		gameGreeting.forEach((item, index) => {
			outPut(item);
		});
		setUserGreeted(true);
	}

	const handleSignIn = useCallback(async (username: string) => {
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
	}, [keychain]);

	const handleSignOut = () => {
		setIsSignedIn(false);
		setUsername('');
	};


	const handleTextEntered = (enteredText: string) => {
		const words = enteredText.toLowerCase().split(" ");
		
		const firstword = words[0];
		
		if(isLoaded && isSignedIn) {
			if (firstword in roomdata.exits) {
				movePlayer(username, roomdata.exits[firstword]);
			} 
		} else {
			switch(firstword) {
			case "login":

				if(isSignedIn) {
					outPut("You are already signed in!");
				} else {
					const tempuser = enteredText.split(/\s+/)[1];
					setUsername(tempuser);
					setGameOutputMessage([]);
				}
				break;

			case "checkme":

				if(isSignedIn) {
					checkPlayer(username);
				}
				break;

			default:

				if(!isSignedIn){
					outPut("You can't do much without signing in! Type 'login' 'your hive username'");
				} else {
					outPut(enteredText);  
				}
				break;
			}
		};
	}

	const movePlayer = (username: string, permlink: string) => {
		const location = gameJSON[permlink];
		updatePlayerData(username, {
			newlocation: {
				"permlink": permlink,
				"author": location.author
			}
		})
		.then(() => {
			fetchData();
		})
		.catch((error) => {
			console.error('Error updating player location:', error);
		});
		return;
		
	};


	//I think this arbitrarily defines this function enough that it can be used to set player desc, as well as 
	//set the short desc and be used when we move the player!

	const updatePlayerData = useCallback(async (username: string, options?: {
		desc?: string,
		shortdesc?: string,
		newlocation?: {
			permlink: string,
			author: string
		}
	}) => {
		try {
			let currentMetadata = userProfileJSON;
			currentMetadata.egodeathplayer = 
			{"Name":username,
			"Description":options?.desc || "We really should define this but oh well.",
			"ShortDesc":options?.shortdesc || "How do you imagine we have a short if we don't a long?",
			"Location":options?.newlocation || {"permlink":"genesis-scaffold-precipice", "author":"raymonjohnstone"}
			} //This has to be the starting room object

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
			}
			await keychain.broadcast(broadcastData as unknown as Broadcast);
		} catch (error) {
			console.error('Error updating account metadata:', {error});
		} finally {}
	}, [ keychain, userProfileJSON]);

	const checkPlayer = useCallback(async (username: string) => {
		const playerSchema = z.object(
		{
			Name: z.string(),
			Description: z.string(),
			ShortDesc: z.string(),
			Location: z.string(),
		});

		function validatePlayerObject(playerObject) {
			const result = playerSchema.safeParse(playerObject);
			return result.success;
		}
		try {
			if(!validatePlayerObject(userProfileJSON.egodeathplayer)){
				console.log(userProfileJSON.egodeathplayer);
				//updateAccountMetadata(username);
			}

		} catch(error) {
			console.error({ error })
		} finally {}
	}, [userProfileJSON]);

	useEffect(() => {
		if (username) {
			handleSignIn(username);
		}
	}, [username, handleSignIn]);

	useEffect(() => {
		if (isSignedIn && !isLoading && !isLoaded) {
			fetchData();
		}
	}, [isLoading, fetchData, isLoaded, isSignedIn]);

	useEffect(() => {
		if (roomdata && isLoaded) {
			outPut(roomdata.title, true);
			outPut(roomdata.body);
			outPut("There is a way to leave: ");
			for(const exit in Object.keys(roomdata.exits)) {
				outPut(Object.keys(roomdata.exits)[exit], true);
			}
		}
	}, [roomdata, isLoaded]);

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