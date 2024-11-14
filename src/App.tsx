import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignOutButton from './components/SignOutButton';
import TextInputBox from './components/TextInputBox';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from 'keychain-sdk';
import { Client } from '@hiveio/dhive';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import gameObjects from './modules/gameObjects';

function App() {

	const client = new Client(["https://api.hive.blog",
		"https://api.hivekings.com",
		"https://anyx.io",
		"https://api.openhive.network"]);

	const keychain = useMemo(() => new KeychainSDK(window, { rpc: 'https://api.hive.blog' }), []);

	async function initializeKeychain() {
		await keychain.isKeychainInstalled();
	};

	window.onload = initializeKeychain;

	const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
	const [isSignedIn, setIsSignedIn] = useState(false);
		//const [submittingData, setsubmittingData] = useState(false);
	const [username, setUsername] = useState('');
	const [roomdata, setRoomData] = useState({});
	const [dataFetched, setDataFetched] = useState(false);
	const [profileFetched, setprofileFetched] = useState(false);
	const [userGreeted, setUserGreeted] = useState(false);
	const [playerNumber, setplayerNumber] = useState('');
	const [userProfileJSON, setuserProfileJSON] = useState({});

	const outPut = (texttooutput: string) => {
		setGameOutputMessage((prevOutput) => [...prevOutput, {output: texttooutput}]);
	};

	const gameGreeting = ["-",
		"-",
		"-",
		"If you've arrived here by accident and do not have a Hive account. ",
		"Please make your way to https://ecency.com/ to create an account.",
		"Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
		"If this is successful you will see a button on the top right which shows your username." 
		];

	const fillUserProfileJson = useCallback(async (username) => {
		if (isSignedIn && !profileFetched) {
			try {
				const accountInfo = await client.database.getAccounts([username]);
				const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
				setuserProfileJSON(currentMetadata);
			} catch (error) {
				console.error('Error fetching user profile:', error);
			} finally {
				setprofileFetched(true);

			}
		}
	}, [client.database, isSignedIn, profileFetched]);

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
			fillUserProfileJson(username);
		}
	}, [ keychain, fillUserProfileJson ]);

	const handleSignOut = () => {
		setIsSignedIn(false);
		setUsername('');
	};

	const populateRoomdata = useCallback(async () => {
		if (!dataFetched && profileFetched) {
			try {
				const fetchData = async () => {
					try {
						const obtainplayernumber = userProfileJSON.egodeathplayer;
						console.log('obtainplayernumber:', obtainplayernumber);
						const transactionData = await client.database.getTransaction(obtainplayernumber);
						console.log('transactionData:', JSON.parse(transactionData.operations[0][1].json).Player.Location);
						const playerlocation = JSON.parse(transactionData.operations[0][1].json).Player.Location;
						console.log("this is our player location: ", playerlocation);
						const obtainroomdata = await client.database.getTransaction(playerlocation);
						console.log("obtainroomdata: ", obtainroomdata);
						const processRoomdata = JSON.parse(obtainroomdata.operations[0][1].json).Room.ReferencePost;
						console.log("processRoomdata: ", processRoomdata)
						const fetchtheactualdesc = await client.database.getTransaction(processRoomdata);
						const arewefinallydoneyet = fetchtheactualdesc.operations[0][1];
						console.log("this done? ", arewefinallydoneyet);

						 
						console.log('fetchtheactualdesc: ', fetchtheactualdesc);
						setRoomData(arewefinallydoneyet);
					} catch (error) {
						console.error('Error fetching data:', error);
					} finally {
						setDataFetched(true);
					}
				};

				fetchData();
			} catch (error) {
				console.error('Error in populateRoomdata:', error);
			}
		}
	}, [dataFetched, client.database, profileFetched, userProfileJSON]);

	const handleTextEntered = (enteredText: string) => {
		switch(enteredText.toLowerCase().split(/\s+/)[0]) {

		case "login":

			if(isSignedIn) {
				outPut("You are already signed in!");
			} else {
				const tempuser = enteredText.split(/\s+/)[1];
				setUsername(tempuser);
				setGameOutputMessage([]);
				outPut(roomdata.title);
				outPut(roomdata.body);
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

	useEffect(() => {
		if (username) {
			handleSignIn(username);
			populateRoomdata();
		}
	}, [username, handleSignIn, populateRoomdata]);

	const updateAccountMetadata = useCallback(async (username: string, playerNumber: string) => {
		try {
			let currentMetadata = userProfileJSON;
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
			await keychain.broadcast(broadcastData as unknown as Broadcast);    
		} catch (error) {
			console.error('Error updating account metadata:', {error});
		} finally {}
	}, [ keychain, userProfileJSON]);

	const createPlayerObject = useCallback(async (username: string) => {
		try {
			const broadcastData = {
				"username": username,
				"operations": [
					[
						"custom_json",
						{
							"account": username,
							"id":"egodeath",
							"json_metadata":
							{"Player":
							{"Name":username,
							"PreviousId":"0", //This should be zero by default
							"Description":"We really should define this but oh well.",
							"ShortDesc":"How do you imagine we have a short if we don't a long?",
							"Location":"e30c67b655856c3932de9c46da4d359a9c1fd614"} //This has to be the starting room object
						}, 
					}
					]
					],
				'method': KeychainKeyTypes.posting
			}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const ourNewplayerNumber = await keychain.broadcast(broadcastData as unknown as Broadcast);    
		} catch (error) {
			console.error('Error updating account metadata:', {error});
		} finally {
			setplayerNumber(ourNewplayerNumber.transactionid);
		}
	}, [keychain]);

	const checkPlayer = useCallback(async (username: string) => {
		try {
			if(!userProfileJSON.egodeathplayer){
				createPlayerObject(username);
				updateAccountMetadata(username, playerNumber);
			}

		} catch(error) {
			console.error({ error })
		} finally {}
	}, [updateAccountMetadata, playerNumber, createPlayerObject, userProfileJSON]);

	console.log("userprofileJson: ",userProfileJSON);
	console.log("roomdata: ", roomdata);

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