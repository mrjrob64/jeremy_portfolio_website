
const cors = require("cors");
const express = require("express");
const http = require("http");
const { join } = require("path");
const { send } = require("process");
const { Server } = require("socket.io");

const PORT = 3001;
const app = express();
app.use("/socket", express.static(join(__dirname, "../build")));

app.get(/^\/socket(\/.*)?$/, (req, res) => {
    res.sendFile(join(__dirname, "../build", "index.html"));
});  

app.use(cors());

const server = http.createServer(app);

// Enable CORS for WebSocket connections
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    //origin: "http://ec2-3-21-98-156.us-east-2.compute.amazonaws.com:3000", // Replace with your client's origin
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Your users array and other routes...
var users = new Map();
var rooms = new Map();
var games = [];

// Send update of all players to all games
setInterval(sendUpdates, 1000/80);

const tank_types = ["basic", "bouncer", "sniper", "machine_gun", "big"];

io.on("connection", (socket) => {
  console.log("A user connected");

  // Handle login event
  socket.on("login", (data) => {
    const username = data.username;
    console.log(username);
    if (users.has(username)) {
      socket.emit("loginResponse", {
        success: false,
        message: "Username already taken",
      });
    } else if (username == "" || username == null) {
      socket.emit("loginResponse", {
        success: false,
        message: "Username cannot be empty",
      });
    } else {
      users.set(username, socket);
      socket.emit("loginResponse", { success: true });
      sendRoomDataToClient(socket);
    }
  });

  // Sends room data to client when something changes with rooms
  function updateRoomData() {
    const roomData = [];
    for (const [roomName, room] of rooms) {
      roomData.push({
        roomName: roomName,
        host: room.host.username,
        numPlayers: room.getNumPlayers()
      });
    }
    io.emit("updateRoomData", roomData);
  }

  // Sends room data to client when they load Lobby page
  function sendRoomDataToClient(client) {
    const roomData = [];
    for (const [roomName, room] of rooms) {
      //console.log(room.getNumPlayers());
      roomData.push({
        roomName: roomName,
        host: room.host.username,
        numPlayers: room.getNumPlayers()
      });
    }
    client.emit("updateRoomData", roomData);
  }

  // Handle create room event
  socket.on("createRoom", (data) => {
    const username = data.username;
    const roomName = data.roomName;
    if (rooms.has(roomName)) {
      socket.emit("createRoomResponse", {
        success: false,
        message: "Room name already taken",
      });
    } else if (roomName == "" || roomName == null) {
      socket.emit("createRoomResponse", {
        success: false,
        message: "Room name cannot be empty",
      });
    } else {
      
      rooms.set(roomName, new Room(username));
      socket.join(roomName);
      socket.emit("createRoomResponse", { success: true });
      updateRoomData();
      const room = rooms.get(roomName);
      io.to(roomName).emit("updateUserData", room.getPlayersInfo());
    }
  });

  //handle join room event
  socket.on("joinRoom", (data) => {
    const username = data.username;
    const roomName = data.roomName;
    if (rooms.has(roomName)) {
      const room = rooms.get(roomName);
      if (room.players.size >= 4) {
        socket.emit("joinRoomResponse", {
          success: false,
          message: "Room is full",
        });
      } else if (room.started) {
        socket.emit("joinRoomResponse", {
          success: false,
          message: "Game has already started",
        });
      } else {
        var canJoin = room.addPlayer(username);
        room.displayRoom();
        if(!canJoin) {
          socket.emit("joinRoomResponse", {
            success: false,
            message: "Room is full",
          });
        } else {
          socket.join(roomName);
          socket.emit("joinRoomResponse", { 
            success: true, 
            host: room.host.username
          });
          updateRoomData();
          io.to(roomName).emit("updateUserData", room.getPlayersInfo());
        }
      }
    } else {
      socket.emit("joinRoomResponse", {
        success: false,
        message: "Room does not exist",
      });
    }
  });

  // Handle leave room event
  socket.on("leaveRoom", (data) => {
    const username = data.username;
    const roomName = data.roomName;
    if (rooms.has(roomName)) {
      const room = rooms.get(roomName);
      if (room.host.username == username) {
        var areOtherUsers = room.hostLeft();
        if (!areOtherUsers) {
          rooms.delete(roomName);
        } else {
          const newHost = room.host.username;
          io.to(roomName).emit("newRoomHost", {roomName: roomName, host: newHost});
        }
      } else {
        room.kickPlayer(username);
      }
      socket.leave(roomName);
      updateRoomData();
      socket.emit("leaveRoomResponse", {
        success: true
      });
    } else {
      socket.emit("leaveRoomResponse", {
        success: false,
        message: "Room does not exist",
      });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected");
    // Remove user from users map
    var username_to_remove = "";
    for (const [username, user] of users) {
      if (user == socket) {
        username_to_remove = username;
        users.delete(username);
        break;
      }
    }

    // Remove user from room
    for (const [roomName, room] of rooms) {
      if (room.host.username == username_to_remove) {
        var areOtherUsers = room.hostLeft();
        var deletedRoom = false;
        if (!areOtherUsers) {
          rooms.delete(roomName);

          //if game has started, end game
          for(var i = 0; i < games.length; i++) {
            if(games[i].roomName == roomName) {
              games.splice(i, 1);
              deletedRoom = true;
              break;
            }
          }
          
        } 
        const newHost = room.host;
        io.to(roomName).emit("newRoomHost", {roomName: roomName, host: newHost});
        //if game has started and room is not deleted kill player
        if(!deletedRoom) {
          for(var i = 0; i < games.length; i++) {
            if(games[i].roomName == roomName) {
              const players = games[i].players;
              for(var [id, player] of players) {
                if(player.username == username_to_remove) {
                  player.health = 0;
                  player.alive = false;
                  break;
                }
              }
              break;
            }
          }
        }
        break;
      } else {
        room.kickPlayer(username_to_remove);
        //if game has started and room is not deleted kill player
        for(var i = 0; i < games.length; i++) {
          if(games[i].roomName == roomName) {
            const players = games[i].players;
            for(var [id, player] of players) {
              if(player.username == username_to_remove) {
                player.health = 0;
                player.alive = false;
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }
    //Remove user from socket room
    socket.leaveAll();

    updateRoomData();
    rooms.forEach((room) => {
      room.displayRoom();
    });
    
  });

  // Handle ready event
  socket.on("ready", (data) => {
    console.log("ready", socket.id);
    const username = data.username;
    const roomName = data.roomName;
    if (rooms.has(roomName)) {
      const room = rooms.get(roomName);
      room.players.forEach((player) => {
        if (player.username == username) {
          player.ready = !player.ready;
        }
      });
      if(room.host.username == username) {
        room.host.ready = !room.host.ready;
      }
      room.checkStart();
      io.to(roomName).emit("updateUserData", room.getPlayersInfo());
      if(room.started) {
        console.log("start game");
        io.to(roomName).emit("start game", {roomName: roomName});
        games.push({roomName: roomName, players: new Map(), loaded: false});
        games.forEach((game) => {
          console.log(game.roomName);
        });
      }
    } 
    
  });

  // Handle start game event
  socket.on("start game player data", (data) => {
    console.log("start game player data", socket.id);
    const username = data.username;
    const roomName = data.roomName;
    console.log(roomName);
    var type = "basic";
    var color = "red";
    if (rooms.has(roomName)) {
      const room = rooms.get(roomName);
      room.players.forEach((player) => {
        if (player.username == username) {
          type = player.type;
        }
      });
      if(room.host.username == username) {
        type = room.host.type;
      }
    }
    console.log("Determined type:", type);
    if(type == "basic") {
      color = "red";
    } else if(type == "bouncer") {
      color = "blue";
    } else if(type == "sniper") {
      color = "green";
    } else if(type == "machine_gun") {
      color = "yellow";
    } else if(type == "big") { 
      color = "purple";
    }
    var xPos = 50;
    var yPos = 50;

    if (games.length > 0) {
      for(var i = 0; i < games.length; i++) {
        if(games[i].roomName == roomName) {
          if(games[i].players.size == 0) {
            xPos = 50;
            yPos = 50;
          } else if(games[i].players.size == 1) {
            xPos = 500 - 70;
            yPos = 50;
          } else if(games[i].players.size == 2) {
            xPos = 50;
            yPos = 500 - 70;
          } else if(games[i].players.size == 3) {
            xPos = 500 - 70;
            yPos = 500 - 70;
          }
          const player = new Player(xPos, yPos, type, color, username);
          games[i].players.set(socket.id, player);
          break;
        }
      }
    }
  });

  // Handle change type event
  socket.on("changeType", (data) => {
    const username = data.username;
    const roomName = data.roomName;
    const type = data.type;
    if (rooms.has(roomName)) {
      const room = rooms.get(roomName);
      room.updatePlayerType(username, type);
      io.to(roomName).emit("updateUserData", room.getPlayersInfo());
    }
    
  });

  // Handle game events
  socket.on('player_direction', function (data) {
    //console.log("player direction");
    const direction = data.movement_direction;
    const roomName = data.roomName;

    //console.log(direction);

    const game = games.find((game) => game.roomName === data.roomName);
    let player = "";

    if (game) {
      player = game.players.get(socket.id);
      // Rest of your code using 'player'
    } else {
      //console.log(games.length);
      console.error("Game not found for roomName: ", roomName);
    }

    if(!player) {
        return;
    }
    player.set_player_direction(direction);
  });

  socket.on('fire_bullet', function (data) {
    const x_velocity = data.x_velocity;
    const y_velocity = data.y_velocity;
    const roomName = data.roomName;
    const game = games.find((game) => game.roomName === data.roomName);
    let player = "";

    if (game) {
      player = game.players.get(socket.id);
      // Rest of your code using 'player'
    } else {
      console.error("Game not found for roomName: ", data.roomName);
    }
    if(!player) {
        return;
    }
    player.fire_bullet(x_velocity, y_velocity);
  });
});

function sendUpdates() {
  update_players();
  end_games();

  
  for(var game of games) {
    var player_data = [];
    var bullet_data = [];
    const players = game.players;
    const roomName = game.roomName;
    for (let [id, player] of players) {
      
      //console.log(player.get_player_data());
      player_data.push(player.get_player_data());
      bullet_data.push(player.get_bullets_data());

      io.to(id).emit('this_player_data', {x: player.get_player_data().x, y: player.get_player_data().y, alive: player.get_player_data().alive});
    }
    if (player_data.length > 0) {
      io.to(roomName).emit('update', {player_data: player_data, bullet_data: bullet_data});
    }
  }
}

function update_players() {
  for(var game of games) {
      const players = game.players;
      for (var [id, player] of players) {
          player.timestep_update();
      }
      bullet_player_collision(players);
  }
}

function end_games() {
  //go through all games and check if only one player or less is alive
  for(var i = 0; i < games.length; i++) {
    //check if the number of players in the game is the same as the number of players in the lobby

    if(games[i].loaded || games[i].players.size == rooms.get(games[i].roomName).getNumPlayers()) {
      games[i].loaded = true;
    const players = games[i].players;
    var numAlive = 0;
    var alivePlayer = "";
    for(var [id, player] of players) {
      if(player.alive) {
        numAlive++;
        alivePlayer = player.username;
      }
    }
    //console.log(numAlive);
    if(numAlive == 1) {
      console.log("ending game...");
      io.to(games[i].roomName).emit("end game", {isWinner: true, winner: alivePlayer});
      
      //make room not started and make players not ready
      for (const [roomName, room] of rooms) {
        if(roomName == games[i].roomName) {
          room.checkEnd();
          for(var j = 0; j < room.players.length; j++) {
            room.players[j].ready = false;
          }
          room.host.ready = false;
          io.to(roomName).emit("updateUserData", room.getPlayersInfo());
          
          break;
        }
      }

      games.splice(i, 1);
      break;

      
    }
    else if(numAlive == 0) {
      console.log("ending game...");
      io.to(games[i].roomName).emit("end game", {isWinner: false, winner: "No one"});
      
      //make room not started and make players not ready
      for (const [roomName, room] of rooms) {
        if(roomName == games[i].roomName) {
          room.checkEnd();
          for(var j = 0; j < room.players.length; j++) {
            room.players[j].ready = false;
          }
          room.host.ready = false;
          io.to(roomName).emit("updateUserData", room.getPlayersInfo());
          
          break;
        }
      }

      games.splice(i, 1);
      break;

      
    }
    }
  }
}



server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

class Room {
  constructor(host) {
    this.host = { username: host, ready: false, type: "basic"};
    this.players = [];
    this.started = false;
  }

  updatePlayerType(username, type) {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].username === username) {
        this.players[i].type = type;
        break;
      }
    }
    if (this.host.username === username) {
      this.host.type = type;
    }
  }

  checkStart() {
    if(this.players.length >= 1) {
      if(this.players.every(player => player.ready)) {
        if(this.host.ready) {
          this.started = true;
        }
      }
    }
  }

  checkEnd() {
    this.started = false;
  }

  addPlayer(player) {
    if (this.players.length >= 3) return false;
    const newPlayer = { username: player, ready: false, type: "basic"};
    this.players.push(newPlayer);
    return true; // Indicate successful addition
  }

  kickPlayer(player) {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].username == player) {
        this.players.splice(i, 1);
        break;
      }
    }
  }

  hostLeft() {
    if (this.players.length == 0) return false;
    this.host = this.players[0];
    this.players.splice(0, 1);
    return true;
  }

  displayRoom() {
    console.log("Room: " + JSON.stringify(this.host));
    console.log("------Players------");
    for (let i = 0; i < this.players.length; i++) {
      console.log("player " + i + ": " + JSON.stringify(this.players[i]));
    }
    console.log("------------------");
  }

  getNumPlayers() {
    return this.players.length + 1;
  }

  getPlayersInfo() {
    return [this.host, ...this.players];
  }
}

class Player {
  constructor(x, y, type, color, username) {
      this.x = x;
      this.y = y;
      this.xSpeed = 0;
      this.ySpeed = 0;
      this.bullets = [];
      this.health = 100;
      this.alive = true;
      this.bulletSpeedMultiplier = 1;
      this.bulletDamage = 10;
      this.bulletSize = 5;
      this.color = color;
      this.playerSpeedMultiplier = 1;
      this.username = username;

      if(type == "basic") {
          this.size = 30;
          this.maxBullets = 3;
          this.maxBounces = 2;
      }

      if(type == "bouncer") {
          this.size = 30;
          this.maxBullets = 3;
          this.maxBounces = 5;
          this.playerSpeedMultiplier = 2;
      }

      if(type == "sniper") {
          this.size = 40;
          this.maxBullets = 1;
          this.maxBounces = 2;
          this.bulletSpeedMultiplier = 2.5;
      }

      if(type == "machine_gun") {
          this.size = 20;
          this.maxBullets = 10;
          this.maxBounces = 2;
          this.bulletDamage = 5;
      }

      if(type == "big") {
          this.size = 50;
          this.maxBullets = 1;
          this.maxBounces = 2;
          this.bulletDamage = 20;
          this.bulletSize = 30;
          this.bulletSpeedMultiplier = 0.75;
      }

      
  }

  isPlayerAlive() {
      this.alive = this.health > 0;
  }

  fire_bullet(xSpeed, ySpeed) {
      if(this.bullets.length <= this.maxBullets) {
          const bullet = new Bullet(this.x + this.size/2, this.y + this.size/2, xSpeed, ySpeed, this.maxBounces, this.bulletSpeedMultiplier, this.bulletDamage, this.bulletSize);
          this.bullets.push(bullet);
      }
  }

  clear_bullets() {
      for(var i = 0; i < this.bullets.length; i++) {
          if(!this.bullets[i].alive) {
              this.bullets.splice(i, 1);
          }
      }
  }

  

  timestep_update() {
      this.isPlayerAlive();
      this.x += this.xSpeed;
      this.y += this.ySpeed;
      if(this.x <= 0) {
          this.x = 0;
      } if(this.y <= 0) {
          this.y = 0;
      }
      if(this.x >= 500 - this.size) {
          this.x = 500 - this.size;
      }
      if(this.y >= 500 - this.size) {
          this.y = 500 - this.size;
      }
      for(var i = 0; i < this.bullets.length; i++) {
          this.bullets[i].timestep_update();
      }
      this.clear_bullets();
  }

  get_player_data() {
      return {
          x: this.x,
          y: this.y,
          xSpeed: this.xSpeed,
          ySpeed: this.ySpeed,
          health: this.health,
          alive: this.alive,
          size: this.size,
          color: this.color,
          username: this.username
      };
  }

  get_bullets_data() {
      var bullets_data = [];
      for(var i = 0; i < this.bullets.length; i++) {
          bullets_data.push(this.bullets[i].get_bullet_data());
      }
      return bullets_data;
  }

  set_player_direction(direction) {
      const isup = direction.up;
      const isdown = direction.down;
      const isleft = direction.left;
      const isright = direction.right;
      
      this.xSpeed = 0;
      this.ySpeed = 0;

      if(isup) {
          this.ySpeed -= 1 * this.playerSpeedMultiplier;
      }
      if(isdown) {
          this.ySpeed += 1 * this.playerSpeedMultiplier;
      }
      if(isleft) {
          this.xSpeed -= 1 * this.playerSpeedMultiplier;
      }
      if(isright) {
          this.xSpeed += 1 * this.playerSpeedMultiplier;
      }
  }
}

class Bullet {
  constructor(x, y, xSpeed, ySpeed, maxBounces, bulletSpeedMultiplier, bulletDamage, bulletSize) {
      this.x = x;
      this.y = y;
      this.xSpeed = xSpeed * bulletSpeedMultiplier;
      this.ySpeed = ySpeed * bulletSpeedMultiplier;
      this.bounces = 0;
      this.maxBounces = maxBounces;
      this.size = bulletSize;
      this.bulletDamage = bulletDamage;

      this.width = 500;
      this.height = 500;

      this.radius = 5;
      this.alive = true;
  }

  timestep_update() {
      this.checkBoundaries();
      this.x += this.xSpeed;
      this.y += this.ySpeed;
  }

  checkBoundaries() {
      if(this.x < 0 || this.x > this.width - this.size) {
          this.xSpeed *= -1;
          this.bounces++;
      }
      if(this.y < 0 || this.y > this.height - this.size) {
          this.ySpeed *= -1;
          this.bounces++;
      }
      if(this.bounces == this.maxBounces) {
          this.destroy();
      }
  }

  destroy() {
      this.alive = false;
  }
  get_bullet_data() {
      return {
          x: this.x,
          y: this.y,
          xSpeed: this.xSpeed,
          ySpeed: this.ySpeed,
          size: this.size,
      };
  }

  
}

function bullet_player_collision(players) {
  for(var [id, player] of players) {
      for(var [id1, player1] of players) {
          if(id != id1 && player1.alive) {
              for(var i = 0; i < player.bullets.length; i++) {
                  if (
                      player.bullets[i].x + player.bullets[i].size > player1.x &&
                      player.bullets[i].x < player1.x + player1.size &&
                      player.bullets[i].y + player.bullets[i].size > player1.y &&
                      player.bullets[i].y < player1.y + player1.size
                  ) {
                      player.bullets[i].destroy();
                      player1.health -= player.bullets[i].bulletDamage;
                      //console.log("Bullet:", player.bullets[i].x, player.bullets[i].y, player.bullets[i].size);
                      //console.log("Player:", player1.x, player1.y, player1.size);                    
                  }
              }
          }
      }
  }
}
