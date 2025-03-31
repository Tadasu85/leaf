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
  const [username, setUsername] = useState<string | null>(null);
  const [roomdata, setRoomData] = useState({});
  const [gameJSON, setgameJSON] = useState({});
  const [userProfileJSON, setuserProfileJSON] = useState({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [userGreeted, setUserGreeted] = useState(false);
  const [isLoadedGame, setIsLoadedGame] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [lastKnownLocation, setLastKnownLocation] = useState(null);
  const [loading, setLoading] = useState(false); // Added loading state
  const processedOperations = useMemo(() => new Set(), []);

  //We depend on keychain for signing and dhive for fetching data from the hive chain.
  //Here we initializse them both.

  const hivenode = 'https://api.openhive.network';

  const client = useMemo(() => new Client([hivenode]), []);

  const keychain = useMemo(() => new KeychainSDK(window, { rpc: hivenode }), []);

  async function initializeKeychain() {
    try {
      const isInstalled = await keychain.isKeychainInstalled();
      console.log("Keychain is installed:", isInstalled);
      if (isInstalled) {
        console.log("Keychain Initialized");
      }
      return isInstalled; // Return boolean indicating success
    } catch (error) {
      console.error('Error initializing Keychain:', error);
      return false;
    }
  };

  const checkAndInitialize = async () => {
    const initialized = await initializeKeychain();
    if (initialized) {
      console.log("Can Play is set")
    }
  }

  window.onload = checkAndInitialize;

  const gameGreeting = [
    "If you've arrived here by accident and do not have a Hive account. ",
    "Please make your way to https://ecency.com/ to create an account.",
    "Otherwise you may proceed with a login command by typing 'login' 'your hive username'",
    "You will also need the hive keychain extension installed and the account added.",
    "If this is successful you will see your username in the top right."
  ];

  const traceUserActivity = useCallback(async (username: string, targetKey: string) => {
    try {
      const accountHistory = await client.database.getAccountHistory(username, -1, 100);
      if (accountHistory.length > 0) {
        for (let i = accountHistory.length - 1; i >= 0; i--) {
          // eslint-disable-next-line
          const [seq, op] = accountHistory[i];
          if (op.op[0] === 'custom_json' && op.op[1].id === 'ego-death') {
            const jsonData = JSON.parse(op.op[1].json);
            if (jsonData[targetKey]) {
              processedOperations.add(op.trx_id);
              return jsonData[targetKey];
            }
          }
        }
      }
      console.warn(`User data not found in recent account history for key ${targetKey}.`);
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
    console.log("Outputting:", texttooutput, { bold });
    setGameOutputMessage((prevOutput) => [...prevOutput, { output: texttooutput, bold: bold }]);
  }, []);

  const movePlayer = useCallback(async (username: string, options?: {
    newlocation?: {
      permlink: string,
      author: string
    }
  }) => {
    setLoading(true); // Start loading
    try {
      let currentMetadata = userProfileJSON;
      const currentPlayerData = currentMetadata || {};

      let movedPlayer = {
        "Location": options?.newlocation ?? currentPlayerData.Location ?? { "permlink": "genesis-scaffold-precipice", "author": "raymonjohnstone" }
      };
      const broadcastData = {
        "username": username,
        "operations": [
          [
            "custom_json",
            {
              "required_auths": [],
              "required_posting_auths": [username],
              "id": "ego-death",
              "json": JSON.stringify({
                "move_to": movedPlayer
              })
            }
          ]
        ],
        'method': KeychainKeyTypes.posting
      };
      console.log("movePlayer broadcastData:", broadcastData);
      const result = await keychain.broadcast(broadcastData as Broadcast);
      console.log("movePlayer result:", result);
      if (result && result.success && result.result && result.result.id) {
        return true;
      } else {
        const message = "Error: Failed to update player data. Please check your Keychain and try again.";
        console.error("Broadcast failed:", { result });
        console.error("Broadcast result details:", JSON.stringify(result));
        outPut(message, true);
        setLoading(false); // Stop loading on error
        return false;
      }
    } catch (error) {
      const message = `Error updating account metadata: ${error.message || error}`;
      console.error(message, error);
      outPut(message, true);
      setLoading(false); // Stop loading on exception
      return false;
    }
  }, [keychain, userProfileJSON, outPut]);

  const fetchPlayerData = useCallback(async (username: string) => {
    try {
      console.log(`fetchPlayerData for ${username}`);
      const playerLocation = await traceUserActivity(username, "move_to");
      console.log("playerLocation:", playerLocation);
      const accountInfo = await client.database.getAccounts([username]);
      console.log("accountInfo:", accountInfo);
      if (accountInfo.length === 0) {
        const message = "Account does not exist on the Hive blockchain.";
        console.error(message);
        outPut(message, true);
        setLoading(false);
        return;
      }
      const currentMetadata = JSON.parse(accountInfo[0].posting_json_metadata);
      setuserProfileJSON(currentMetadata);

      if (!playerLocation) {
        const message = "Welcome to the game!  You don't seem to have a location yet, so you start at the beginning.";
        console.warn(message);
        outPut(message, true);
        //setLoading(false);  // Keep loading, we'll load genesis room.
        const transactionData = await client.database.call('get_content', ["raymonjohnstone", "genesis-scaffold-precipice"]);
        let obtaineddata = {
          "body": await transactionData.body,
          "title": await transactionData.title,
          "exits": gameJSON["genesis-scaffold-precipice"].exits,
          "author": "raymonjohnstone",
          "permlink": "genesis-scaffold-precipice"
        };
        setRoomData(obtaineddata);
        outPut(obtaineddata.title, true);
        outPut(obtaineddata.body, false);
        if (obtaineddata.exits) {
          outPut("There is a way to leave: ", false);
          for (const exit in obtaineddata.exits) {
            outPut(exit, true);
          }
        }
        setLoading(false);
        return;
      }

      const transactionData = await client.database.call('get_content', [playerLocation.Location.author, playerLocation.Location.permlink]);
      console.log("transactionData", transactionData);

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
      console.log("Obtained Data: ", obtaineddata);

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
        setLoading(false); // Stop loading here, after data is fetched and displayed
      } else {
        const message = "Room data not found!";
        console.warn(message);
        outPut(message, true);
        setLoading(false);  // Stop loading if no room data
      }
    } catch (error) {
      const message = `Error fetching data: ${error.message || error}`;
      console.error(message, error);
      setGeneralError(message);
      outPut(message, true);
      setLoading(false); // Stop loading on error
    }
  }, [client, gameJSON, outPut, traceUserActivity]);

  const updatePlayerDesc = useCallback(async (username: string, options?: {
    desc?: string,
    shortdesc?: string,
  }) => {
    setLoading(true); //start loading
    console.log("Firing updatePlayerData!");
    try {
      let currentMetadata = userProfileJSON;
      const currentPlayerData = currentMetadata.egodeathplayer || {};

      currentMetadata.egodeathplayer = {
        "Name": username,
        "Description": options?.desc ?? currentPlayerData.Description ?? "We really should define this but oh well.",
        "ShortDesc": options?.shortdesc ?? currentPlayerData.ShortDesc ?? "How do you imagine we have a short if we don't a long?",
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
      console.log("updatePlayerDesc broadcastData:", broadcastData);
      const result = await keychain.broadcast(broadcastData as unknown as Broadcast);
      console.log("updatePlayerDesc result::", { result });
      if (result && result.success && result.result && result.result.id) {
        console.log("Broadcast initiated successfully:", { result });
        setuserProfileJSON(currentMetadata);
        setLoading(false); //stop loading
        return true;
      } else {
        const message = "Error: Failed to update player data. Please check your Keychain and try again.";
        console.error("Broadcast failed:", { result });
        console.error("Broadcast result details:", JSON.stringify(result));
        outPut(message, true);
        setLoading(false); //stop loading
        return false;
      }
    } catch (error) {
      const message = `Error updating account metadata: ${error.message || error}`;
      console.error(message, error);
      outPut(message, true);
      setLoading(false); //stop loading
      return false;
    }
  }, [keychain, userProfileJSON, outPut]);

  const debouncedFetchPlayerData = useMemo(
    () => debounce((username) => {
      fetchPlayerData(username);
    }, 10),
    [fetchPlayerData]
  );
  const handleCommand = useCallback(async (enteredText: string) => {
  	const words = enteredText.toLowerCase().split(" ");
  	const command = words[0];
  	if (!isSignedIn) {
  		outPut("Please log in first.", true);
  		return;
  	}

  	switch (command) {
  	case "@describe":
  		const description = words.slice(1).join(" ");
  		const updateOptionsDesc = { desc: description };
  		await updatePlayerDesc(username, updateOptionsDesc);
  		outPut("Your description has been updated.", false);
  		break;

  	case "@describeshort":
  		const shortdescription = words.slice(1).join(" ");
  		const updateOptionsShort = { shortdesc: shortdescription };
  		await updatePlayerDesc(username, updateOptionsShort);
  		outPut("Your short description has been updated.", false);
  		break;

  	case "look":
  		if (words[1] === 'self' || words[1] === 'me') {
  			if (userProfileJSON && userProfileJSON.egodeathplayer) {
  				outPut(`You see yourself.  ${userProfileJSON.egodeathplayer.Description}`, false);
  				outPut(`Short description: ${userProfileJSON.egodeathplayer.ShortDesc}`, false);
  			}
  			else {
  				outPut("You look at yourself, but don't see anything special.", true);
  			}
  		}
  		else if (roomdata) {
  			outPut(roomdata.title, true);
  			outPut(roomdata.body, false);
  			if (roomdata.exits) {
  				outPut("There is a way to leave: ", false);
  				for (const exit in roomdata.exits) {
  					outPut(exit, true);
  				}
  			}
  		} else {
  			outPut("Error: Room data not available.", true);
  		}
  		break;

  	default:
  		if (roomdata && roomdata.exits && roomdata.exits[command]) {
  			const now = new Date();
  			console.log("We fired the action: ", now);
  			const newlocation = roomdata.exits[command];
  			try {
  				const updateSuccess = await movePlayer(username, {
  					newlocation: {
  						permlink: newlocation,
  						author: gameJSON[roomdata.exits[command]].author,
  					},
  				});
  				outPut(`You traipse off towards ${command}.`, false);
  				setLastKnownLocation(updateSuccess.newlocation);
  			} catch (error) {
  				const message = `Error moving player to: ${newlocation}.`;
  				console.error(message, error);
  				outPut(message, true);
            setLoading(false); // Ensure loading is stopped on error
        }
    } else if (roomdata && roomdata.exits && !(command in roomdata.exits)) {
    	outPut("Error: Invalid destination.", true);
    } else {
    	outPut("Unknown command.", true);
    }
    break;
}
}, [username, outPut, roomdata, movePlayer, isSignedIn, gameJSON, setLastKnownLocation, updatePlayerDesc, userProfileJSON]);


  const handleTextEntered = useCallback(
    async (enteredText: string) => {
      try {
        const words = enteredText.toLowerCase().split(' ');
        const firstword = words[0];

        if (firstword === 'login' || firstword === 'connect') {
          const tempuser = enteredText.split(/\s+/)[1];
          if (tempuser === undefined) {
            outPut('You must follow your login/connect command with your hive username.', true);
            return;
          }

          outPut(`Attempting login as ${tempuser}`, false);
          setGeneralError(null);

          const data: Login = {
            username: tempuser,
            message: '{"login":"123"}',
            method: 'posting',
            title: 'Login',
          };
          console.log("Calling keychain.login with:", data);
          try {
            const loginResult = await keychain.login(data as Login);
            console.log("keychain.login result:", loginResult);
            if (loginResult) {
              setUsername(tempuser);
              setIsSignedIn(true);
              try {
                debouncedFetchPlayerData(tempuser);
              } catch (fetchError) {
                const message = `Failed to fetch player data after login: ${fetchError.message || fetchError}`;
                console.error(message, fetchError);
                setGeneralError(message);
                outPut(message, true);
                setIsSignedIn(false);
                setUsername(null);
                return;
              }
              outPut(`Login successful as ${tempuser}`, false);
            } else {
              const message = 'Login failed, keychain returned false';
              setIsSignedIn(false);
              setUsername(null);
              setGeneralError(message);
              console.error(message);
              outPut(message, true);
            }
          } catch (loginError) {
            // Catch errors from keychain.login
            const message = `Keychain login error: ${loginError.message || loginError}`;
            console.error(message, loginError);
            setGeneralError(message);
            outPut(message, true);
            setIsSignedIn(false);
            setUsername(null);
          }
        } else {
          if (isSignedIn) {
            outPut(`Executing command: ${enteredText}`, false);
            await handleCommand(enteredText);
          } else {
            const message = 'You must log in before executing commands.';
            setGeneralError(message);
            console.error(message);
            outPut(message, true);
          }
        }
      } catch (error) {
        const message = `An error occurred: ${error.message || error}`;
        console.error(message, error);
        setGeneralError(message);
        outPut(message, true);
        setIsSignedIn(false);
        setUsername(null);
      }
    },
    [keychain, debouncedFetchPlayerData, outPut, handleCommand, isSignedIn]
  );

  useEffect(() => {
    if (generalError) {
      console.log("The process encountered an error: ", generalError);
    }
  }, [generalError]);

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
        if (processedOperations.has(op.trx_id)) {
          return;
        }
        processedOperations.add(op.trx_id);
        try {
          const jsonData = JSON.parse(op.op[1].json);
          const newLocation = jsonData.move_to;
          if (op.op[1].required_posting_auths[0] === username && isSignedIn) {
            if (newLocation && (!lastKnownLocation || newLocation.permlink !== lastKnownLocation.permlink || newLocation.author !== lastKnownLocation.author)) {
              setLoading(true); //start loading
              debouncedFetchPlayerData(username);
              setLastKnownLocation(newLocation);
              const now = new Date();
              console.log("The operation completed: ", now);
            }
          }
        } catch (jsonError) {
          console.error('Error parsing JSON:', jsonError);
          setLoading(false);
        }
      }
    };

    const handleError = (error) => {
      if (isUnmounted.current) return;
      console.error('Stream error:', error);
      const baseDelay = 0;
      const maxDelay = 0;
      const exponentialFactor = 0.0;
      const retryDelay = Math.min(maxDelay, Math.pow(exponentialFactor, retryCount.current) * baseDelay);
      retryCount.current++;
      const handleEnd = () => { };
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

    const handleEnd = () => { };

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
        {loading ? <div className="Loading">"Loading..."</div> : null}
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