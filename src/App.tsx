import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
import { debounce } from 'lodash';

function App() {

	const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
	const [username, setUsername] = useState('');
	const [roomdata, setRoomData] = useState({});
	const [gameJSON, setgameJSON] = useState({});
	const [userProfileJSON, setuserProfileJSON] = useState({});
	const [userGreeted, setUserGreeted] = useState(false);
	const [isLoadedGame, setIsLoadedGame] = useState(false);
	const [isSignedIn, setIsSignedIn] = useState(false);
	const [lastKnownLocation, setLastKnownLocation] = useState(null);
	const processedOperations = useMemo(() => new Set(), []);

    //We depend on keychain for signing and dhive for fetching data from the hive chain.
    //Here we initializse them both.

	const hivenode = 'https://api.openhive.network';

	const client = useMemo(() => new Client([hivenode]), []);

	const keychain = useMemo(() => new KeychainSDK(window, { rpc: hivenode }), []);

	async function initializeKeychain() {
		try {
			await keychain.isKeychainInstalled();
		} catch (error) {
			throw error;
		}
	};

	window.onload = initializeKeychain();

	const gameGreeting = [
		"If you've arrived here by accident and do not have a Hive account. ",
		"Please make your way to https://ecency.com/ to create an account.",
		"Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
		"If this is successful you will see your username in the top right."
	];

	const traceUserActivity = useCallback(async (username: string) => {
		try {
        const accountHistory = await client.database.getAccountHistory(username, -1, 100); // Or your desired window size
        if (accountHistory.length > 0) {
            for (let i = accountHistory.length - 1; i >= 0; i--) { // Iterate backward
            	const [seq, op] = accountHistory[i];
            	if (op.op[0] === 'custom_json' && op.op[1].id === 'ego-death') {
            		const jsonData = JSON.parse(op.op[1].json);
            		if (jsonData.move_to) {
            			processedOperations.add(op.trx_id);
            			console.log(`User location found in operation ${seq}:`, jsonData.move_to, op);
            			return jsonData.move_to;
            		}
            	}
            }
          }
          console.warn(`User location not found in recent account history.`);
          return null;
        } catch (error) {
        	console.error('Error fetching account history:', error);
        	return null;
        }
      }, [client, processedOperations]);

	const fetchgameData = useCallback(async () => {
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
		setGameOutputMessage((prevOutput) => [...prevOutput, { output: texttooutput, bold: bold }]);
	}, []);


	const updatePlayerData = useCallback(async (username: string, options?: {
		newlocation?: {
			permlink: string,
			author: string
		}
	}) => {
		console.log("Firing updatePlayerData!");
		try {
			let currentMetadata = userProfileJSON;
			const currentPlayerData = currentMetadata || {};

			let updatedPlayerData = {
				"Location": options?.newlocation ?? currentPlayerData.Location ?? { "permlink": "genesis-scaffold-precipice", "author": "raymonjohnstone" }
			};

			const broadcastData = {
				"username": username,
				"operations": [
					[
						"custom_json",
						{
							"required_auths": [username],
							"required_posting_auths": [],
							"id": "ego-death",
							"json": JSON.stringify({
								"move_to": updatedPlayerData
							})
						}
					]
				],
				'method': KeychainKeyTypes.active
			};
			console.log("Broadcast Data:", { broadcastData });
			const result = await keychain.broadcast(broadcastData as Broadcast);
			console.log("Broadcast result::", { result });
			if (result && result.success && result.result && result.result.id) {
				console.log("Broadcast initiated successfully:", { result });
				return true;
			} else {
				console.error("Broadcast failed:", { result });
				console.error("Broadcast result details:", JSON.stringify(result));
				outPut("Error: Failed to update player data. Please check your Keychain and try again.", true);
				return false;
			}
		} catch (error) {
			console.error('Error updating account metadata:', error);
			outPut("Error: Failed to update player data. Please check your Keychain and try again.", true);
			return false;
		}
	}, [keychain, userProfileJSON, outPut]);

	const fetchPlayerData = useCallback(async (username: string) => {
		console.log("Fetch players data fired!");
		try {
			const playerLocation = await traceUserActivity(username);
			const accountInfo = await client.database.getAccounts([username]);
			const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
			setuserProfileJSON(currentMetadata);
			if (!playerLocation) {
				console.warn("Player location not found.");
				outPut("Player location not found.", true);
				return;
			}

			const transactionData = await client.database.call('get_content', [playerLocation.Location.author, playerLocation.Location.permlink]);

			let obtaineddata = null;
			for (const obj in gameJSON) {
				if (obj === playerLocation.Location.permlink) {
					let foundexits = gameJSON[obj].exits;
					obtaineddata = {
						"body": await transactionData.body,
						"title": await transactionData.title,
						"exits": await foundexits,
						"author": await playerLocation.Location.author,
						"permlink": await playerLocation.Location.permlink
					};
					break;
				}
			}

			if (obtaineddata) {
				setRoomData(obtaineddata);
				outPut(obtaineddata.title, true);
				outPut(obtaineddata.body, false);
				if (obtaineddata.exits) {
					outPut("There is a way to leave: ", false);
					for (const exit in obtaineddata.exits) {
						outPut(exit, true);
					}
				}
			} else {
				console.warn("Room data not found!");
				outPut("Room data not found.", true);
			}
		} catch (error) {
			console.error('Error fetching data:', error);
			outPut("Error fetching data.", true);
		}
	}, [client, gameJSON, outPut, traceUserActivity]);

	const debouncedFetchPlayerData = useMemo(
		() => debounce((username) => {
			console.log("Debounced fetchPlayerData called:", username);
			fetchPlayerData(username);
		}, 500),
		[fetchPlayerData]
		);


	const handleTextEntered = useCallback(async (enteredText: string): enteredText => {
		const words = enteredText.toLowerCase().split(" ");
		const firstword = words[0];
		console.log(firstword);
		if (firstword === "login") {
			if (isSignedIn) {
				outPut("You are already signed in!", false);
			} else {
				const tempuser = enteredText.split(/\s+/)[1];
				setUsername(tempuser);
				outPut(`Logging in as ${tempuser}`, false);
			}
		} else if (isSignedIn) {
			if (firstword === "@describe") {
				const description = words.slice(1).join(" ");
				const updateOptions = {
					desc: description
				};
				await updatePlayerData(username, updateOptions);
				outPut("Your description has been updated.", false);
			} if (firstword === "@describeshort") {
				const shortdescription = words.slice(1).join(" ");
				const updateOptions = {
					shortdesc: shortdescription
				};
				await updatePlayerData(username, updateOptions);
				outPut("Your short description has been updated.", false);
			} if (firstword === "look") {
				outPut(roomdata.title, true);
				outPut(roomdata.body, false);
				if (roomdata.exits) {
					outPut("There is a way to leave: ", false);
					for (const exit in roomdata.exits) {
						outPut(exit, true);
					};
				};
			} if (firstword in roomdata.exits) {
				try {
					const newlocation = roomdata.exits[firstword];
					if (newlocation) {
						const updateSuccess = await updatePlayerData(username, {
							newlocation: {
								"permlink": newlocation,
								"author": gameJSON[roomdata.exits[firstword]].author
							}
						});
						if (updateSuccess) {
							debouncedFetchPlayerData(username);
						}
					} else {
						console.warn("Location not found in game data:", permlink);
						outPut("Error: Invalid destination.", true);
					}
				} catch (error) {
					console.error("Error moving player:", error);
					outPut("Error moving player.", true);
					throw error;
				}
			}
		}
	}, [username, outPut, roomdata, updatePlayerData, isSignedIn, debouncedFetchPlayerData, gameJSON]);

	const handleSignIn = useCallback(async (username: string) => {
		if (!isSignedIn) {
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
					debouncedFetchPlayerData(username);
				}
			}
		}, [keychain, isSignedIn, debouncedFetchPlayerData]);

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

	const isUnmounted = useRef(false);
	const retryCount = useRef(0);

	useEffect(() => {
		let stream = client.blockchain.getOperationsStream();

		const handleOperation = async (op) => {
			if (op.op[1].id === 'ego-death') {
				console.log('Received custom_json operation:', op);
				if (processedOperations.has(op.trx_id)) {
					console.log('Operation already processed:', op.trx_id);
					return;
				}

				processedOperations.add(op.trx_id);

				try {
					const jsonData = JSON.parse(op.op[1].json);
					const newLocation = jsonData.move_to;

					if (op.op[1].required_auths[0] === username && isSignedIn) {
						if (newLocation && (!lastKnownLocation || newLocation.permlink !== lastKnownLocation.permlink || newLocation.author !== lastKnownLocation.author)) {
							console.log("Player moved to new location. Displaying room data");
							debouncedFetchPlayerData(username);
							setLastKnownLocation(newLocation);
						}
					}
				} catch (jsonError) {
					console.error('Error parsing JSON:', jsonError);
				}
			}
		};

		const handleError = (error) => {
			if (isUnmounted.current) return;
			console.error('Stream error:', error);

			const retryDelay = Math.min(30000, Math.pow(2, retryCount.current) * 1000);
			retryCount.current++;

			const handleEnd = () => {
				console.log('Stream ended.');
			};

			setTimeout(() => {
				if (!isUnmounted.current) {
					stream = client.blockchain.getOperationsStream();
					stream.on('data', handleOperation);
					stream.on('error', handleError);
					stream.on('end', handleEnd);
					try {
						stream.destroy();
					} catch (e) {
						console.error("Error destroying stream:", e);
					}
				}
			}, retryDelay);
		};

		const handleEnd = () => {
			console.log('Stream ended.');
		};

		stream.on('data', handleOperation);
		stream.on('error', handleError);
		stream.on('end', handleEnd);

		return () => {
			isUnmounted.current = true;
			processedOperations.clear();
			try {
				stream.destroy();
			} catch (e) {
				console.error("Error destroying stream during unmount:", e);
			}
		};
	}, [client, username, isSignedIn, debouncedFetchPlayerData, lastKnownLocation, processedOperations]);

	return (
		<div className="App">
		<header className="App-header">
		<div className="Title">E̴̙̣̦̩̱̮͇̋̐̏̕G̶̱͕̦͎̯͙̳̋̽͒͋̾͌̌̚͜O̴̪̤͎̼͙̫͌̏͒̑̍̏͜͠ ̶̗͎̯̥̮̲̠̝̮̲̃͆͊̽Ḓ̶̘̞̂Ȇ̶̹͎͓̳̼͇̠͜ͅA̸͖͖̠̖̙̐̍̀̉̍̾̇̚Ṯ̷̜̀̆͗̏͊͘̚H̴̛̼
		</div>
		<div className="SignOutButton">
		<SignOutButton isSignedIn={isSignedIn} username={username} 
		onSignOut={handleSignOut} userProfileJSON={userProfileJSON} />
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