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
		try {
			await keychain.isKeychainInstalled();
		} catch (error) {
			throw error;
		}
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
	//const [isLoadedPlayer, setIsLoadedPlayer] = useState(false);
	//const [isDisplayed, setisDisplayed] = useState(false);
	const [isSignedIn, setIsSignedIn] = useState(false);

	const fetchgameData = useCallback(async()  => {
		console.log("Fetch game data fired!");
		try {
			setIsLoadedGame(false);
			const gameInfo = await client.database.getAccounts(["hive-109456"]);
			const parsedgameInfo = JSON.parse(gameInfo[0].posting_json_metadata);
			setgameJSON(parsedgameInfo.egodeathgamedata.rooms_authors_exits);
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}, [client, setgameJSON]);

	useEffect(() => {
		if (!isLoadedGame) {
			fetchgameData();
			setIsLoadedGame(true);
		}

	}, [isLoadedGame, fetchgameData]);

	const outPut = useCallback((texttooutput: string, bold?: boolean) => {
		setGameOutputMessage((prevOutput) => [...prevOutput, {output: texttooutput, bold: bold}]);
	}, []);

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
	console.log("Firing updatePlayerData!");
	try {
		let currentMetadata = userProfileJSON;
		const currentPlayerData = currentMetadata.egodeathplayer || {};

		currentMetadata.egodeathplayer = {
			"Name": username,
			"Description": options?.desc ?? currentPlayerData.Description ?? "We really should define this but oh well.",
			"ShortDesc": options?.shortdesc ?? currentPlayerData.ShortDesc ?? "How do you imagine we have a short if we don't a long?",
			"Location": options?.newlocation ?? currentPlayerData.Location ?? { "permlink": "genesis-scaffold-precipice", "author": "raymonjohnstone" }
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
			console.log("Broadcast Data:", { broadcastData });
      		const result = await keychain.broadcast(broadcastData as unknown as Broadcast); // Store the result
      		console.log("Broadcast result::", { result });

      	if (result) { // Check for successful broadcast
      		console.log("Account metadata updated successfully:", { result });
        	// Important: Update userProfileJSON *only* after successful broadcast
        	setuserProfileJSON(currentMetadata); // Update the local state to match blockchain
        	// outPut("Player data updated successfully.", false); //User feedback
    	} else {
    		console.error("Broadcast failed:", { result });
    		console.error("Broadcast result details:", JSON.stringify(result)); // Add this line
    		outPut("Error: Failed to update player data. Please check your Keychain and try again.", true);
    		throw new Error("Broadcast failed");
		}
		} catch (error) {
			console.error('Error updating account metadata:', error);
      		outPut("Error: Failed to update player data. Please check your Keychain and try again.", true); // User feedback
      		// Consider if you want to re-throw the error here as well.
      		// If you do, the calling function (e.g., in movePlayer or handleTextEntered)
      		// will know that the update failed and can take appropriate action.
      		throw error; // Uncomment to re-throw.
  		}
  	}, [keychain, userProfileJSON, outPut]); // Add outPut as a dependency

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
            } else {
            	console.warn("Room data not found!");
            }
        } catch (error) {
        	console.error('Error fetching data:', error);
        	throw error; // Make sure to re-throw the error
        } finally {
            //setIsLoadedPlayer(true); // Set this *after* the data is handled
        }
    }, [client, gameJSON, outPut]); // Add outPut as dependency

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
      			console.log("Move player ran!");
      			console.log(roomdata.exits[firstword]);
    			//setIsLoadedPlayer(false); // Set loading to false *before* the try block
    			try {
    				const newlocation = roomdata.exits[firstword];

    				if (newlocation) {
    					await updatePlayerData(username, {
    						newlocation: {
    							"permlink": newlocation,
    							"author": gameJSON[roomdata.exits[firstword]].author
    						}
    					});
        			await fetchPlayerData(username); // Fetch *only* if updatePlayerData is successful
        		} else {
        			console.warn("Location not found in game data:", permlink);
        			outPut("Error: Invalid destination.", true);
        		}
        	} catch (error) {
        		console.error("Error moving player:", error);
        		outPut("Error moving player.", true);
        		throw error;
        	} finally {
      				// It's important to keep the setting of the loading state in the finally block
      				// to ensure it is always set.
      				// However, we do not want to fetch the player data if the update fails.
      				//setIsLoadedPlayer(true); // Ensure loading state is set in finally
      			}
      		}
      	}
      }, [username, outPut, roomdata, updatePlayerData, isSignedIn, fetchPlayerData, gameJSON]);

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
				await fetchPlayerData(username);
				}
			}
	}, [keychain, isSignedIn, fetchPlayerData]);

	useEffect(() => {
		if (username) {
			handleSignIn(username);
		}

	}, [username, handleSignIn]);

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