import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import { useState, useEffect, useCallback, useMemo, useObservable } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from 'keychain-sdk';
//import HiveMultisigSDK from 'hive-multisig-sdk';
import { Client } from '@hiveio/dhive';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import gameObjects from './modules/gameObjects';

// eslint-disable-next-line @typescript-eslint/no-unused-vars

function App() {

	const client = new Client(["https://api.hive.blog",
		"https://api.hivekings.com",
		"https://anyx.io",
		"https://api.openhive.network"]);

	async function initializeKeychain() {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const isInstalled = await keychain.isKeychainInstalled();
	};

	const keychain = useMemo(() => new KeychainSDK(window, { rpc: 'https://api.hive.blog' }), []);

	window.onload = initializeKeychain;

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
	const [isSignedIn, setIsSignedIn] = useState(false);
		//const [submittingData, setsubmittingData] = useState(false);
	const [username, setUsername] = useState('');
	const [roomdata, setRoomData] = useState(Object);
	const [dataFetched, setDataFetched] = useState(false);
	const [userGreeted, setUserGreeted] = useState(false);

	const outPut = (texttooutput: string) => {
		setGameOutputMessage((prevOutput) => [...prevOutput, {output: texttooutput}]);
	};

	const gameGreeting = [
		"If you've arrived here by accident and do not have a Hive account. ",
		"Please make your way to https://ecency.com/ to create an account.",
		"Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
		"If this is successful you will see a button on the top right which shows your username." 
		];

	if (!userGreeted && !isSignedIn) {
		gameGreeting.forEach((item, index) => {
			outPut(item);
		});
		setUserGreeted(true);
	}

	useEffect(() => {
		if (!dataFetched) {
			const fetchData = async () => {
				try {
					const transactionData = await client.database.getTransaction('f5b16e17f8ace48211dee36f7f101708ea7f25a2');
					setRoomData(transactionData);
								setDataFetched(true); // Set the flag to indicate data is fetched
							} catch (error) {
								console.error('Error fetching data:', error);
							}
						};

						fetchData();
					}
				}, [dataFetched, client.database]);

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
			setIsSignedIn(true);
		} catch (error) {
			console.error("Login error:", error);

		}
	}, [ keychain ]);

	const handleSignOut = () => {
		setIsSignedIn(false);
		setUsername('');
	};

	const handleTextEntered = (enteredText: string) => {
		switch(enteredText.toLowerCase().split(/\s+/)[0]) {

		case "login":

			if(isSignedIn) {
				outPut("You are already signed in!");
			} else {
				const tempuser = enteredText.split(/\s+/)[1];
				setUsername(tempuser);
				setGameOutputMessage([]);
				outPut(roomdata.operations[0][1].title);
				outPut(roomdata.operations[0][1].body);
			}
			break;

		case "checkme":

			if(isSignedIn) {
				checkPlayer(username);
			}
			break;

		default:

			if(!isSignedIn){
				outPut("You can't do much without signing in! Type login *yourusername*");
			} else {
				outPut(enteredText);  
			}
			break;
		}
	};

	useEffect(() => {
		if (username) {
			handleSignIn(username);
		}
	}, [username, handleSignIn]);

	const updateAccountMetadata = useCallback(async (username: string, playerNumber: string) => {
		try {

			const accountInfo = await client.database.getAccounts([username]);
			let currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
			currentMetadata.profile.egodeathplayer = playerNumber;
			delete currentMetadata.profile.reputation;

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const broadcastFunction = await keychain.broadcast(broadcastData as unknown as Broadcast);    
		} catch (error) {
			console.error('Error updating account metadata:', {error});
		} finally {}
	}, [client.database, keychain]);

	const checkPlayer = useCallback(async (username: string) => {
		try {
			let IsPlayer = await client.database.getAccounts([username]);

			let playerData = JSON.parse(IsPlayer[0].posting_json_metadata);

			if(!playerData.profile.egodeathplayer){
				updateAccountMetadata(username, "933938420868f4dd0cb1062bfb365f19fccb7c4b");
			}

		} catch(error) {
			console.error({ error })
		} finally {}
	}, [client.database, updateAccountMetadata]);

	return (
		<div className="App">
		<header className="App-header">
		<div className="Title"> E̴̙̣̦̩̱̮͇̋̐̏̕G̶̱͕̦͎̯͙̳̋̽͒͋̾͌̌̚͜O̴̪̤͎̼͙̫͌̏͒̑̍̏͜͠ ̶̗͎̯̥̮̲̠̝̮̲̃͆͊̽Ḓ̶̘̞̂Ȇ̶̹͎͓̳̼͇̠͜ͅA̸͖͖̠̖̙̐̍̀̉̍̾̇̚Ṯ̷̜̀̆͗̏͊͘̚H̴̛̼ </div>
		<div className="SignOutButton">
		<SignOutButton isSignedIn={isSignedIn} username={username} onSignOut={handleSignOut} />
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