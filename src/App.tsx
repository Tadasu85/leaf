import './App.css';
import GameOutputWindow, { GameOutputMessage } from './components/GameOutputWindow';
import SignInButton from './components/SignInButton';
import TextInputBox from './components/TextInputBox';
import React, { useState } from 'react';
import { KeychainSDK, Login, KeychainKeyTypes } from "keychain-sdk";

const keychain = new KeychainSDK(window);

function App() {
  async function initializeKeychain() {
    const isInstalled = await keychain.isKeychainInstalled();
    if (isInstalled) {
      console.log("Keychain is installed");
    } else {
      console.error("Keychain is not installed");
    }
  }

  window.onload = initializeKeychain;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [gameOutputMessage, setGameOutputMessage] = useState<GameOutputMessage[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [gameOutput, setGameOutput] = useState([""]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  
  async function handleSignIn() {
    const data: Login = {
      "username": username,
      "message": "{\"login\":\"123\"}",
      "method": KeychainKeyTypes.posting,
      "title": "Login"
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const login = await keychain.login(data);
      setIsSignedIn(true); // Update directly after successful login
    } catch (error) {
      console.error("Login error:", error);
      // Handle the error here, e.g., display an error message to the user
    }
  }

  const handleSignOut = () => {
    setIsSignedIn(false);
    setUsername("");
  };

  const handleTextEntered = (enteredText: string) => {
    switch(enteredText.toLowerCase().split(/\s+/)[0]) {

      case "login":
        setUsername(enteredText.split(/\s+/)[1]);
        handleSignIn();
        break;

      default:
        setGameOutputMessage((prevOutput) => [...prevOutput, { output: enteredText }]);
        break;
        
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="Title"> EGO DEATH </div>
        <div className="SignInButton">
          <SignInButton isSignedIn={isSignedIn} username={username} onSignOut={handleSignOut} />
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