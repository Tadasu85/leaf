import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
//import { z } from 'zod';

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

	const fetchPlayerData = useCallback(async (username: string) => {
		console.log("Fetch players data fired!");
		try {
			const accountInfo = await client.database.getAccounts([username]);
			const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
			setuserProfileJSON(currentMetadata);
			const playerLocation = currentMetadata.egodeathplayer.Location;
			const transactionData = await client.database.call('get_content', [playerLocation.author, playerLocation.permlink]);
            // Instead of setting state here, directly use the data:
            let obtaineddata = null; // Initialize
            for (const obj in gameJSON) {
            	if (obj === playerLocation.permlink) {
            		let foundexits = gameJSON[obj].exits;
                    obtaineddata = { // Assign the value
                    	"body": await transactionData.body,
                    	"title": await transactionData.title,
                    	"exits": await foundexits,
                    	"author": await playerLocation.author,
                    	"permlink": await playerLocation.permlink
                    };
                    break; // Important: Exit the loop once found
                };
            };
            if (obtaineddata) { // Check if data was found!
                setRoomData(obtaineddata); // Update state *after* the data is ready
                outPut(obtaineddata.title, true);  // Display directly from fetched data
                outPut(obtaineddata.body, false);
                if (obtaineddata.exits) {
                	outPut("There is a way to leave: ", false);
                	for (const exit in obtaineddata.exits) {
                		outPut(exit, true);
                	};
                };
                setisDisplayed(true);
            } else {
            	console.warn("Room data not found!");
            }
        } catch (error) {
        	console.error('Error fetching data:', error);
        } finally {
            setIsLoadedPlayer(true); // Set this *after* the data is handled
        }
    }, [client, gameJSON, outPut]); // Add outPut as dependency

	const movePlayer = useCallback(async (username: string, permlink: string) => {
		console.log("Move player ran!");
		try {
			const location = gameJSON[permlink];

    // Update player location in userProfileJSON
			await updatePlayerData(username, {
				newlocation: {
					"permlink": permlink,
					"author": location.author
				}
			});

    // Update roomdata with initial location information
			setRoomData({ 
				author: location.author, 
				permlink: permlink 
			}); 

    // Fetch full room data including title, body, and exits
			await fetchPlayerData(username); 
		} catch (error) {
			console.error(error);
		} finally {
		}
	}, [fetchPlayerData, gameJSON, updatePlayerData, setRoomData]);


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
      			if (roomdata.exits) {
      				outPut("There is a way to leave: ", false); 
      				for(const exit in roomdata.exits) {
      					outPut(exit, true);
      				};
      			};
      		}if(firstword in roomdata.exits) {
      			await movePlayer(username, roomdata.exits[firstword])
      			.then(setIsLoadedPlayer(false));
				//We need to make sure that roomdata gets filled with the new data here!!!
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
		}

	}, [isSignedIn, isLoadedPlayer, fetchPlayerData, username]);

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