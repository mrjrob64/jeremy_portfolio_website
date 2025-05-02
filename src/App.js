import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const URL = 'https://mrjrob64.tail656be5.ts.net';
//const URL = 'http://localhost:3001';
//const URL = 'http://ec2-3-21-98-156.us-east-2.compute.amazonaws.com:3001';
const socket = io(URL, {
  path: '/socket.io', // This is usually the default, but you can specify it explicitly
  transports: ['websocket'], // Optional: helps avoid long-polling issues
});


const pages = {
  LOGIN: 'login',
  LOBBY: 'lobby',
  ROOM: 'room',
  GAME: 'game'
};

export default function App() {
  const [currentPage, setCurrentPage] = useState(pages.LOGIN);
  const [errorMessage, setErrorMessage] = useState('');
  const [roomList, setRoomList] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [host, setHost] = useState('');

  const gameDataRef = useRef({
    username: '',
    roomName: ''
  });

  const handleLogin = (username) => {
    const username_data = { username: username };
    socket.emit('login', username_data);

    socket.on('loginResponse', (response) => {
      if (response.success) {
        setCurrentPage(pages.LOBBY);
        setErrorMessage('');
        setUsername(username);
        gameDataRef.current.username = username; 
        console.log('login successful');
      } else {
        setErrorMessage('login failed: ' + response.message);
        console.log('login failed: ', response.message);
      }
    });
  }

  const handleCreateRoom = (newRoomName) => {
    const newRoomName_data = { username: username, roomName: newRoomName };
    socket.emit('createRoom', newRoomName_data);
    socket.on('createRoomResponse', (response) => {
      if (response.success) {
        setCurrentPage(pages.ROOM);
        setErrorMessage('');
        console.log('create room successful');
        gameDataRef.current.roomName = newRoomName;
        setRoomName(newRoomName);
        
        setHost(username);
      } else {
        setErrorMessage('create room failed: ' + response.message);
        console.log('create room failed: ', response.message);
      }
    });
  };

  const handleJoinRoom = (roomName) => {
    const joinRoom_data = { username: username, roomName: roomName };
    socket.emit('joinRoom', joinRoom_data);
    socket.on('joinRoomResponse', (response) => {
      if (response.success) {
        setCurrentPage(pages.ROOM);
        setErrorMessage('');
        console.log('join room successful');
        gameDataRef.current.roomName = roomName;
        setRoomName(roomName);
        setHost(response.host);
      } else {
        setErrorMessage('join room failed: ' + response.message);
        console.log('join room failed: ', response.message);
      }
    });
  }

  const handleLeaveRoom = () => {
    const leaveRoom_data = { username: username, roomName: roomName };
    socket.emit('leaveRoom', leaveRoom_data);
    
  };

  const handleReady = () => {
    const ready_data = { username: username, roomName: roomName };
    socket.emit('ready', ready_data);
  }

  const handleChangeType = (type) => {
    const changeType_data = { username: username, roomName: roomName, type: type };
    socket.emit('changeType', changeType_data);
  }
  useEffect(() => {
    const handleUpdateRoomData = (data) => {
      console.log('updating room data...');
      console.log(data);
      setRoomList(data);
    };
  
    const handleNewRoomHost = (data) => {
      console.log('new room host...');
      const { roomName, host } = data;
      setHost(host);
    };
  
    const handleLeaveRoomResponse = (response) => {
      if (response.success) {
        setCurrentPage(pages.LOBBY);
        setErrorMessage('');
        console.log('leave room successful');
        setRoomName(''); // Update the roomName state to indicate that the user left the room
        setHost('');
      } else {
        setErrorMessage('leave room failed: ' + response.message);
        console.log('leave room failed: ', response.message);
      }
    };
  
    const handleUpdateUserData = (data) => {
      console.log('updating user data...');
      console.log(data);
      setUsersData(data);
    };
  
    const handleStartGame = () => {
      console.log('starting game...');
      
      socket.emit('start game player data', { 
        username: gameDataRef.current.username, 
        roomName: gameDataRef.current.roomName 
      });
    
      setCurrentPage(pages.GAME);

      
    };

    const handleEndGame = (data) => {
      const isWinner = data.isWinner;
      const winner = data.winner;
      
      alert("game ended");
      if(isWinner) {
        alert(winner + " won!");
      } else {
        alert("tie!");
      }
      
      setCurrentPage(pages.ROOM);
    }
  
    // Subscribe to socket events
    socket.on('updateRoomData', handleUpdateRoomData);
    socket.on('newRoomHost', handleNewRoomHost);
    socket.on('leaveRoomResponse', handleLeaveRoomResponse);
    socket.on('updateUserData', handleUpdateUserData);
    socket.on('start game', handleStartGame);
    socket.on('end game', handleEndGame);
  
    // Clean up event listeners on component unmount
    return () => {
      socket.off('updateRoomData', handleUpdateRoomData);
      socket.off('newRoomHost', handleNewRoomHost);
      socket.off('leaveRoomResponse', handleLeaveRoomResponse);
      socket.off('updateUserData', handleUpdateUserData);
      socket.off('start game', handleStartGame);
      socket.off('end game', handleEndGame);
    };
  }, []); // Empty dependency array to run the effect only once during component mount
  
    


  let pageComponent;
  let navComponent;
  switch(currentPage) {
    case pages.LOGIN:
      pageComponent = <Login 
        onLogin={handleLogin} 
        clearErrorMessage={() => setErrorMessage('')} 
        errorMessage={errorMessage}
      />;
      navComponent = <div></div>;
      break;
    case pages.LOBBY:
      pageComponent = <Lobby 
        handleJoinRoom={handleJoinRoom}
        handleCreateRoom={handleCreateRoom}
        roomList={roomList}
        clearErrorMessage={() => setErrorMessage('')}
        errorMessage={errorMessage}
        
      />;
      navComponent = <div>username: {username}</div>;
      break;
    case pages.ROOM:
      pageComponent = <Room 
        leaveRoom={handleLeaveRoom}
        roomName={roomName}
        username={username}
        usersData={usersData}
        handleReady={handleReady}
        handleChangeType={handleChangeType}
      />;
      navComponent = <div>username: {username} | room: {roomName} | host: {host}</div>;
      break;
    case pages.GAME:
      pageComponent = <Game 
        username={username}
        roomName={roomName}
      />;
      //navComponent = <div>username: {username} | room: {roomName} | host: {host}</div>;
      break;
    default:
      pageComponent = <Login />;
  }

  return (
    <div className="App">
      {navComponent}
      {pageComponent}
    </div>
  );
}

function Login({onLogin, clearErrorMessage, errorMessage}) {
  const handleLogin = (event) => {
    event.preventDefault();
    const username = event.target.username.value;
    onLogin(username);
    clearErrorMessage();
  }
  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={handleLogin}>
        <label>
          Username:
          <input type="text" name="username" />
        </label>
        <input type="submit" value="Submit" />
      </form>
      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
    </div>
  );
}

function Lobby({ handleJoinRoom, handleCreateRoom, roomList, clearErrorMessage, errorMessage }) {

  const handleJoinFormSubmit = (roomName) => {
    handleJoinRoom(roomName);
    clearErrorMessage();
  };

  const handleCreate = (event) => {
    event.preventDefault();
    const newRoomName = event.target.newRoomName.value;
    handleCreateRoom(newRoomName);
    clearErrorMessage();
  };

  useEffect(() => {
    // Fetch room list when the Lobby component mounts or when joining a room
    socket.emit('getRoomList');
  }, [handleJoinRoom]);

  return (
    <div>
      
      <h1>Lobby</h1>
      <form onSubmit={handleCreate}>
        <label>
          Create Room:
          <input type="text" name="newRoomName" />
        </label>
        <input type="submit" value="Submit" />
      </form>
      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
      {roomList.map((room) => (
        console.log(room),
        <RoomOption key={room.roomName} onJoin={handleJoinFormSubmit} roomData={room} />
      ))}
    </div>
  );
}

function RoomOption({ onJoin, roomData }) {
  const { numPlayers, roomName } = roomData;
  console.log(numPlayers);

  const handleJoin = (event) => {
    event.preventDefault();
    onJoin(roomName);
  };

  return (
    <div>
      <p>{roomName}</p>
      <p>{numPlayers}/4</p>
      <button onClick={handleJoin}>Join</button>
    </div>
  );
}

function Room({ leaveRoom, roomName, username, usersData, handleReady, handleChangeType }) {
  const handleLeaveRoom = (event) => {
    leaveRoom();
    console.log('leaving room');
  };

  var users = usersData.map((user) => (
    <User
      key={user.username}
      username={user.username}
      isReady={user.ready}
      type={user.type}
      isCurrentPlayer={user.username === username}
      ready={handleReady}
      changeType={handleChangeType}
    />
  ));

  return (
    <div>
      <button type="submit" value="Leave Room" onClick={handleLeaveRoom}>
        Leave
      </button>
      <h1>Room: {roomName}</h1>
      {users}
    </div>
  );
}

function User({ username, isReady, type, isCurrentPlayer, ready, changeType }) {
  const handleChangeType = (event) => {
    event.preventDefault();
    const selectedType = document.querySelector('input[name="tanks"]:checked').value;
    changeType(selectedType);
  }

  const handleReady = (event) => {
    event.preventDefault();
    ready();
  }

  let readyButton;
  if (isCurrentPlayer) {
    readyButton = (
      <>
        <button onClick={handleReady}>
          {isReady ? 'Not Ready' : 'Ready'}
        </button>
        {isReady ? 'Ready' : 'Not Ready'}
        <div id="choose_tank_type">
          <input type="radio" id="basic" name="tanks" value="basic" />
          <label htmlFor="basic">Basic</label><br />
          <input type="radio" id="bouncer" name="tanks" value="bouncer" />
          <label htmlFor="bouncer">Bouncer</label><br />
          <input type="radio" id="sniper" name="tanks" value="sniper" />
          <label htmlFor="sniper">Sniper</label><br />
          <input type="radio" id="machine_gun" name="tanks" value="machine_gun" />
          <label htmlFor="machine_gun">Machine Gun</label><br />
          <input type="radio" id="big" name="tanks" value="big" />
          <label htmlFor="big">Big</label><br />
          <input type="submit" id="submit" value="Submit" onClick={handleChangeType} />
        </div>
        Type: {type}
      </>
    );

  } else {
    readyButton = <div>{isReady ? 'Ready' : 'Not Ready'} </div>;
  }


  return (
    <div>
      <p>{username}</p>
      {readyButton}
    </div>
  );
}


function Game({username, roomName}) {

  useEffect(() => {
    var player_x = 0;
  var player_y = 0;
  var isAlive = true;
  var started = false;

  const canvas = document.getElementById("myCanvas");
  const ctx = canvas.getContext("2d");

  // Socket Events
  const handleUpdate = (data) => {
    console.log(data);
    updateCanvas(data, ctx);
  };

  const handlePlayerData = (data) => {
    updatePlayerPosition(data);
  };

  const handlePlayerStart = (data) => {
    started = true;
  };

  socket.on('update', handleUpdate);
  socket.on('this_player_data', handlePlayerData);
  socket.on('player_start', handlePlayerStart);
  
    // Function to handle input from the user
    var movement_direction = {
      up: false,
      down: false,
      left: false,
      right: false
    };
  
    const handleKeyDown = (event) => {
      var keyPressed = event.keyCode;
      switch (keyPressed) {
        case 65:
          movement_direction.left = true;
          movement_direction.right = false;
          break;
        case 87:
          movement_direction.up = true;
          movement_direction.down = false;
          break;
        case 68:
          movement_direction.right = true;
          movement_direction.left = false;
          break;
        case 83:
          movement_direction.down = true;
          movement_direction.up = false;
          break;
      }
  
      console.log(movement_direction);
      console.log(roomName);
      const data = { movement_direction: movement_direction, username: username, roomName: roomName };
      socket.emit('player_direction', data);
    };
  
    // Function to handle key up events
    const handleKeyUp = (event) => {
      var keyPressed = event.keyCode;
      switch (keyPressed) {
        case 65:
          movement_direction.left = false;
          break;
        case 87:
          movement_direction.up = false;
          break;
        case 68:
          movement_direction.right = false;
          break;
        case 83:
          movement_direction.down = false;
          break;
      }
  
      console.log(movement_direction);
      const data = { movement_direction: movement_direction, username: username, roomName: roomName };
      socket.emit('player_direction', data);
    };
  
    // Function to handle mouse click events
    const handleMouseClick = (event) => {
      console.log(socket.id);
      var rect = canvas.getBoundingClientRect();
      var x_click = event.clientX - (rect.left + 20);
      var y_click = event.clientY - (rect.top + 20);
  
      console.log("x_click: " + x_click);
      console.log("y_click: " + y_click);
  
      var x_displacement_to_click = x_click - player_x;
      var y_displacement_to_click = y_click - player_y;
  
      console.log("player_x: " + player_x);
      console.log("player_y: " + player_y);
  
      var magnitude = Math.sqrt(Math.pow(x_displacement_to_click, 2) + Math.pow(y_displacement_to_click, 2));
  
      var angle = Math.atan2(y_displacement_to_click, x_displacement_to_click);
      console.log("angle: " + angle);
      var x_velocity = 3 * x_displacement_to_click / magnitude;
      var y_velocity = 3 * y_displacement_to_click / magnitude;
  
      socket.emit('fire_bullet', { x_velocity: x_velocity, y_velocity: y_velocity, roomName: roomName, username: username });
    };
  
    function updateCanvas(data, ctx) {
      console.log("BRUH");
      const player_data = data.player_data;
      const bullet_data = data.bullet_data;
  
      ctx.clearRect(0, 0, 500, 500);
      for (var i = 0; i < player_data.length; i++) {
        const isAlive = player_data[i].alive;
        const player_size = player_data[i].size;
        const color = player_data[i].color;
        if (isAlive) {
          ctx.fillStyle = color;
          ctx.fillRect(player_data[i].x, player_data[i].y, player_size, player_size);
        } else {
          ctx.fillStyle = "rgb(200,200,200)";
          ctx.fillRect(player_data[i].x, player_data[i].y, player_size, player_size);
        }
  
        addHealthbar(ctx, player_data[i].x, player_data[i].y, player_data[i].health);
        showUsername(ctx, player_data[i].x, player_data[i].y, player_data[i].username);
      }
      for (var i = 0; i < bullet_data.length; i++) {
        const bullets = bullet_data[i];
        for (var j = 0; j < bullets.length; j++) {
          const bullet_size = bullets[j].size;
          ctx.fillStyle = "rgb(0,0,200)";
          ctx.fillRect(bullets[j].x, bullets[j].y, bullet_size, bullet_size);
        }
      }
    }
  
    function addHealthbar(ctx, x, y, health) {
      ctx.fillStyle = "rgb(0,0,0)";
      ctx.fillRect(x, y - 10, 100, 5);
      ctx.fillStyle = "rgb(0,200,0)";
      ctx.fillRect(x, y - 10, health, 5);
    }

    function showUsername(ctx, x, y, username) {
      ctx.fillStyle = "rgb(0,0,0)";
      ctx.font = "20px Arial";
      ctx.fillText(username, x, y);
    }

  
    function updatePlayerPosition(data) {
      player_x = data.x;
      player_y = data.y;
      const isAlivePreviously = isAlive;
      isAlive = data.alive;
      if(isAlivePreviously && !isAlive) {
          alert("You died!");
          //destroy event listeners
          document.removeEventListener("keydown", handleKeyDown, false);
          document.removeEventListener("keyup", handleKeyUp, false);
          document.removeEventListener("click", handleMouseClick, false);
      }
    }
  
    // Add event listeners for canvas interactions
    document.addEventListener("keydown", handleKeyDown, false);
    document.addEventListener("keyup", handleKeyUp, false);
    document.addEventListener("click", handleMouseClick, false);
  
    // Clean up event listeners on component unmount
    return () => {
      socket.off('update', handleUpdate);
      socket.off('this_player_data', handlePlayerData);
      socket.off('player_start', handlePlayerStart);

      document.removeEventListener("keydown", handleKeyDown, false);
      document.removeEventListener("keyup", handleKeyUp, false);
      document.removeEventListener("click", handleMouseClick, false);
    };
  
  }, []);
  

  return (
    <canvas id="myCanvas" width="500" height="500" style={{ border: "1px solid #000000" }}></canvas>

  );
}