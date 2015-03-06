  var Tournament = function(id) {

    this.adminKey = 'xsd';

    this.id = id;
    this.runningID = 1;
    this.games = {};

    // Every method which changes game header data hits this counter
    // This way HTTP kibitzers can be informed when there is game data change
    // by simply comparing this counter value to their local copies of the counter.
    this.modNumber = 500;

    this.setResultForGame = function(gameID, result) {

      var game = this.games[gameID];

      if (game) {
        this.modNumber++;
        return game.setResult(result);
      }

      return false;

    }

    this.getGameObject = function(gameID) {

      return this.games[gameID];

    }

    this.getGameData = function(gameID) {

      var game = this.games[gameID];

      if (game) {
        return game.getInfoJSON();
      }

      return false;

    }

    this.getAllPositionsOfGame = function(gameID) {

      var game = this.games[gameID];

      if (game) {
        console.log("SERVER: Game found - fetching all positions...");
        return game.getAllPositions();
      }

      return false;

    }

    this.getPositionOfGame = function(gameID) {

      console.log(gameID);

      var game = this.games[gameID];

      if (game) {
        console.log("SERVER: Game found - fetching position...");
        return game.getPosition();
      }

      return false;

    }

    this.newGame = function(white, black, position) {

      console.log("SERVERI: Aloitetaan pelin luonti");
      var key = this.id + "_" + this.runningID++;
      var game = new Game(key, white, black, position);
      this.games[key] = game;
      this.modNumber++;
      console.log("SERVERI: Peli luotu");
      console.log(this.games);
      // Inform tournament's socket kibitzers of new game
      /* this.kibitzers.each(function(user) {
        user.inform('updateYourGameList', newList)
      })
      */
      return game;

    }

    this.makeMoveToGame = function(adminKey, gameID, move) {

      if (this.adminKey !== adminKey) {
        // Not admin
        return false;
      }

      var game = this.games[gameID];

      if (game) {
        return game.makeMove(move);
      }

      return false;

    }

    this.getListOfGames = function() {

      var list = [];

      for (key in this.games) {
        list.push(this.games[key].getInfoJSON());
      }

      return list;
    }


  }

  var Game = function(gameID, white, black, initialPosition) {

    this.initialPosition = initialPosition;

    this.gameID = gameID;
    this.white = white;
    this.black = black;

    this.chessJS;
    this.positions = [];

    this.result = 0;

    this.startedFromCustom = false;


    this.initialize = function() {

      if (this.initialPosition) {
        this.startedFromCustom = true;
      }
      alert('Init Game: ' + this.initialPosition);
      // ChessJS knows how to handle undefined initial position
      this.chessJS = new Chess(this.initialPosition);
      this.positions.push({move: 0, pos: this.chessJS.fen()});
        
    }

    this.getAllPositions = function() {

      return {gameID: this.gameID, positions: this.positions};
    }

    this.getPosition = function() {

      console.log("SERVER: Getting position: " + this.chessJS.fen());

      return {gameID: this.gameID, pos: this.chessJS.fen()};
    }

    this.overridePosition = function(position) {

      var i = this.positions.indexOf(position);

      if (i === -1) {
        console.log("SERVER: Position not found - override fails");
        return false;
      }

      for (var i = this.positions.length - 1; i >= 0; i--) {
        var p = this.positions[i];

        if (p === position) {
          console.log("SERVER: Overridable position was found");
          
          break;
        }

        this.chessJS.undo();

      };
      console.log("Positions before override: " + this.positions.length);
      console.log("Latest position: " + this.positions[this.positions.length-1].pos);
      this.positions = this.positions.slice(0, i+1);
      console.log("Positions After override: " + this.positions.length);
      console.log("Latest position: " + this.positions[this.positions.length-1].pos);

      return this.getPosition();


    }

    this.getResultForPlayer = function(color) {

      // Color comes in as 'white' or 'black' - we need only first letter;
      var color = color[0];

      if (this.result === 0) {
        return '';
      }

      if (this.result === 'd') {
        return '1/2';
      }

      if (color === this.result) {
        return '1';
      }

      return '0';

    }

    this.overrideMakeMove = function(move) {

      // Check if legal move right away using temporary chess.js object

      var temp = new Chess(move.position);

      if (!temp.move(move)) {
        console.log("SERVER: Illegal move in given position - override fails");
        console.log(move);
        return false;
      }

      // Move is legal, start traversing real chess.js object

      // move contains position where move was made.
      var pos = move.position;

      // Check that position truly exists in this game.
      var i = this.positions.indexOf(pos);

      if (i === -1) {
        console.log("SERVER: Position not found - override fails");
        return false;
      }

      for (var i = this.positions.length - 1; i >= 0; i--) {
        var p = this.positions[i];

        if (p === pos) {
          this.chessJS.move(move);
          return true;
        }

        this.chessJS.undo();

      };

      // Update positions
      this.positions = this.positions(0, i);




    }

    this.makeMove = function(move) {
      // move contains position where move was made.
      console.log("SERVER: Making move to a game");

/*      if (move.position !== this.getPosition().pos) {

        console.log("SERVER: Position don't match - overriding old moves with new move");
        return this.overrideMakeMove(move);
      }*/

      if (this.result !== 0) {

        // Game has already ended
        return {error: 'Server was not able to commit a move to game: ' + this.gameID, reason: 'Game has already ended'};
      }

      var moveObj = this.chessJS.move(move);
      if (moveObj) {
        var resObj = {gameID: this.gameID, move: moveObj.san, pos: this.chessJS.fen()};
        this.positions.push(resObj);
        // Inform socket kibitzers
        return resObj;
      }

      return false;
    }

    this.getInfoJSON = function() {

      return {

        'white' : this.white,
        'black' : this.black,
        'whiteResult': this.getResultForPlayer('white'),
        'blackResult': this.getResultForPlayer('black'),
        'result': this.result,
        'gameID': this.gameID,
        'pos'   : this.chessJS.fen()
      }
    }

    this.setResult = function(result) {

      if (result !== 'w' && result !== 'd' && result !== 'b') {
        return {error: 'Server error! Result was not set for game ' + this.gameID, reason: 'Unknown result type'};
      }

      this.result = result;
      return this.getInfoJSON();
      // Inform socket kibitzers.
    }

    this.initialize();


  }

  var TestServer = function() {

    var RANDOMS = 'abcdefghjkmnpqrstuwv1234567890i';

    this.fenValidator = new Chess();

    this.tournaments = {};

    // ADMIN API

    this.populateModUpdateIfNeeded = function(tournamentID, modNumber) {

      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        console.log("SERVER: Comparing mod numbers: " + tournament.modNumber + " vs. " + modNumber);
        if (tournament.modNumber !== modNumber) {
          return {modNumber: tournament.modNumber, listOfGames: tournament.getListOfGames()};
        }
      }
      return 0;
    }

    this.testAdminKey = function(tournamentID, adminKey) {

      var tournament = this.tournaments[tournamentID];

      if (tournament && tournament.adminKey === adminKey) {
        return true;
      }
      return false;
    }

    this.adminAPI = function(tag, msgObj) {

      var retObject;

      // First lets test whether user has rights and that tournament exists
      if (!msgObj.adminKey || !this.testAdminKey(msgObj.tournamentID, msgObj.adminKey)) {
        return {error: 'Server declined your request!', reason: 'Authorization failed and/or tournament does not exist'};
      }

      console.log("SERVER: Received msg of type: " + tag + " | gameID: " + msgObj.gameID + " | Tournament ID: " + msgObj.tournamentID);


      // Main dispatching starts here
      if (tag === 'positionOverride') {

        return this.positionOverride(msgObj.gameID, msgObj.position);
      }
      else if (tag === 'setResultForGame') {

        retObject = {tag: 'resultSet', content: this.setResultForGame(msgObj.gameID, msgObj.result)};
      }
      else if (tag === 'fetchGame') {

        retObject = {tag: 'gameFetch', content: this.getGame(msgObj.gameID)};
      }
      else if (tag === 'fetchLatestPosition') {

        retObject = {tag: 'latestPositionFetch', content: this.getLatestPosition(msgObj.gameID)};
      }
      else if (tag === 'fetchAllPositions') {

        retObject = {tag: 'allPositionsFetch', content: this.getAllPositions(msgObj.gameID)};
      }
      else if (tag === 'submitNewGame') {

        retObject = {tag: 'newGameCreated', content: this.newGame(msgObj.tournamentID, msgObj.white, msgObj.black, msgObj.position)};
      }
      // Dispatching ends here



      // Next we check if user is in need of general updates (e.g game list has changed after his last HTTP request)

      var modUpdate = this.populateModUpdateIfNeeded(msgObj.tournamentID, msgObj.modNumber);

      // Glue modUpdate to return object

      retObject.modUpdate = modUpdate;

      // Send back to user
      return retObject;






    }

    this.API = function(tag, msgObj) {


    }

    this.setResultForGame = function(gameID, result) {

      var parts = gameID.split("_");
      var tournamentID = parts[0];
      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        return tournament.setResultForGame(gameID, result);
      }
      return false;

    } 

    this.getGameObject = function(gameID) {

      var parts = gameID.split("_");
      var tournamentID = parts[0];
      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        return tournament.getGameObject(gameID);
      }

      return false;

    }

    this.positionOverride = function(gameID, position) {

      var game = this.getGameObject(gameID);

      if (game) {
        return game.overridePosition(position);
      }

      return false;
    }


    // HTTP API STARTS!

    this.getGame = function(gameID) {

      var parts = gameID.split("_");
      var tournamentID = parts[0];
      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        return tournament.getGameData(gameID); 
      }

      return false;

    }

    this.createTournament = function() {

      console.log("SERVERI: Luodaan uusi turnaus");

      var id = this.getRandomID();

      // Potential infinite recursion but in practise very slim odds of recursing even once.
      // (System would have to have billions of tournaments saved before performance problems would occur)
      if (this.tournaments.hasOwnProperty(id)) {
        return this.createTournament();
      }
      console.log("SERVERI: Turnaus-id:" + id);
      this.tournaments[id] = new Tournament(id);
      return id;


    }

    this.newGame = function(tournamentID, white, black, position) {

      if (white.length < 3 || white.length > 64 || black.length < 3 || black.length > 64) {

        return {error: 'Game creation failed', reason: 'Player names do not conform to requirements'};
      }

      if (!this.fenValidator.validate_fen(position).valid) {
        return {error: 'Game creation failed', reason: 'Initial position either not provided or it did not pass the validation'};
      }

      console.log("SERVERI: Vastaanotettu pelin luontikehoitus turnaukselle:" + tournamentID);

      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        console.log("SERVERI: turnaus olemassa");
        if (tournament.newGame(white, black, position)) {

          // Game creation success - admin needs new game list
          return tournament.getListOfGames();

        }
      }

      return false;

    }

    this.getRandomID = function() {

      var randomID = '';
      var len = RANDOMS.length;
      randomID += Math.floor(Math.random() * (len-1));
      randomID += Math.floor(Math.random() * (len-1));
      randomID += Math.floor(Math.random() * (len-1));
      randomID += Math.floor(Math.random() * (len-1));

      return randomID;

    }

    this.newPossibleMove = function(adminKey, gameID, move) {

      // move contains position where move was made.

      var parts = gameID.split("_");
      var tournamentID = parts[0];

      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        return tournament.makeMoveToGame(adminKey, gameID, move);
      }

      return false;

    }

    this.getLatestPosition = function(gameID) {
      // Refactor to some common fun
      var parts = gameID.split("_");
      var tournamentID = parts[0];
      var tournament = this.tournaments[tournamentID];

      console.log(tournament);
      if (tournament) {
        return tournament.getPositionOfGame(gameID);
      }

      return false;


    }

    this.getAllPositions = function(gameID) {

      console.log("SERVER: Received request for all positions of game: " + gameID);

      var parts = gameID.split("_");
      var tournamentID = parts[0];
      var tournament = this.tournaments[tournamentID];

      if (tournament) {
        return tournament.getAllPositionsOfGame(gameID);
      }

    }

  }

