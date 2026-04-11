// ============================================================
// Room Manager - Create/Join rooms, seat management
// ============================================================
const { v4: uuidv4 } = require('uuid');

// Active rooms stored in memory
const rooms = new Map();

class Room {
  constructor(hostId, hostName) {
    // Generate a short, easy-to-share room code (6 uppercase chars)
    this.id = this.generateRoomCode();
    this.hostId = hostId;
    this.createdAt = Date.now();
    
    // Seats: { 1: null, 2: null, 3: null, 4: null }
    // Each seat value is either null or { userId, displayName, socketId, connected }
    this.seats = { 1: null, 2: null, 3: null, 4: null };
    
    // Map socketId -> seat number for quick lookup
    this.socketToSeat = new Map();
    // Map userId -> seat number
    this.userToSeat = new Map();
    
    // Game state reference (set when game starts)
    this.game = null;
    this.gameStarted = false;
    
    // Room settings
    this.settings = {
      vakhaiStakes: [3, 5],        // Available vakhai stake values
      customVakhaiStake: true,      // Allow custom stake
      vakhaiCompareRule: 'points',  // Default: compare by total points
    };
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars I,O,0,1
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Ensure uniqueness
    if (rooms.has(code)) return this.generateRoomCode();
    return code;
  }

  /**
   * Add a player to a specific seat
   * @returns {boolean} success
   */
  takeSeat(seatNumber, userId, displayName, socketId, profilePic) {
    if (seatNumber < 1 || seatNumber > 4) {
      return { success: false, error: 'Invalid seat number' };
    }
    if (this.seats[seatNumber] !== null) {
      return { success: false, error: 'Seat is already taken' };
    }
    // Check if user is already in another seat
    if (this.userToSeat.has(userId)) {
      const oldSeat = this.userToSeat.get(userId);
      this.seats[oldSeat] = null;
      this.userToSeat.delete(userId);
    }
    // Remove old socket mapping if exists
    for (const [sid, seat] of this.socketToSeat.entries()) {
      if (seat === seatNumber) {
        this.socketToSeat.delete(sid);
        break;
      }
    }

    this.seats[seatNumber] = {
      userId,
      displayName,
      socketId,
      profilePic,
      connected: true
    };
    this.socketToSeat.set(socketId, seatNumber);
    this.userToSeat.set(userId, seatNumber);

    return { success: true, seat: seatNumber };
  }

  /**
   * Remove player from their seat
   */
  leaveSeat(socketId) {
    const seat = this.socketToSeat.get(socketId);
    if (seat && this.seats[seat]) {
      const userId = this.seats[seat].userId;
      this.seats[seat] = null;
      this.socketToSeat.delete(socketId);
      this.userToSeat.delete(userId);
      return seat;
    }
    return null;
  }

  /**
   * Handle player disconnection (mark as disconnected but keep seat)
   */
  handleDisconnect(socketId) {
    const seat = this.socketToSeat.get(socketId);
    if (seat && this.seats[seat]) {
      this.seats[seat].connected = false;
      this.socketToSeat.delete(socketId);
      return { seat, player: this.seats[seat] };
    }
    return null;
  }

  /**
   * Handle player reconnection
   */
  handleReconnect(userId, newSocketId) {
    const seat = this.userToSeat.get(userId);
    if (seat && this.seats[seat]) {
      // Remove old socket mapping
      for (const [sid, s] of this.socketToSeat.entries()) {
        if (s === seat) {
          this.socketToSeat.delete(sid);
          break;
        }
      }
      this.seats[seat].socketId = newSocketId;
      this.seats[seat].connected = true;
      this.socketToSeat.set(newSocketId, seat);
      return seat;
    }
    return null;
  }

  /**
   * Check if all 4 seats are occupied
   */
  isFull() {
    return Object.values(this.seats).every(s => s !== null);
  }

  /**
   * Check if all seated players are connected
   */
  allConnected() {
    return Object.values(this.seats).every(s => s !== null && s.connected);
  }

  /**
   * Get seat number by socket ID
   */
  getSeatBySocket(socketId) {
    return this.socketToSeat.get(socketId) || null;
  }

  /**
   * Get seat number by user ID
   */
  getSeatByUser(userId) {
    return this.userToSeat.get(userId) || null;
  }

  /**
   * Get public room state (safe to send to clients)
   */
  getPublicState() {
    const seatsInfo = {};
    for (let i = 1; i <= 4; i++) {
      if (this.seats[i]) {
        seatsInfo[i] = {
          displayName: this.seats[i].displayName,
          connected: this.seats[i].connected,
          userId: this.seats[i].userId,
          profilePic: this.seats[i].profilePic
        };
      } else {
        seatsInfo[i] = null;
      }
    }
    return {
      id: this.id,
      hostId: this.hostId,
      seats: seatsInfo,
      isFull: this.isFull(),
      gameStarted: this.gameStarted,
      settings: this.settings
    };
  }

  /**
   * Transfer host to another player if current host leaves
   */
  transferHost() {
    for (let i = 1; i <= 4; i++) {
      if (this.seats[i] && this.seats[i].connected) {
        this.hostId = this.seats[i].userId;
        return this.seats[i];
      }
    }
    return null;
  }

  /**
   * Check if room is empty
   */
  isEmpty() {
    return Object.values(this.seats).every(s => s === null || !s.connected);
  }
}

// ============================================================
// Room Manager Functions
// ============================================================
const roomManager = {
  /**
   * Create a new room
   */
  createRoom(hostId, hostName) {
    const room = new Room(hostId, hostName);
    rooms.set(room.id, room);
    return room;
  },

  /**
   * Get room by ID
   */
  getRoom(roomId) {
    return rooms.get(roomId.toUpperCase()) || null;
  },

  /**
   * Delete a room
   */
  deleteRoom(roomId) {
    rooms.delete(roomId);
  },

  /**
   * Get all active rooms count
   */
  getActiveRoomCount() {
    return rooms.size;
  },

  /**
   * Clean up empty rooms (run periodically)
   */
  cleanupEmptyRooms() {
    for (const [id, room] of rooms.entries()) {
      if (room.isEmpty() && Date.now() - room.createdAt > 5 * 60 * 1000) {
        rooms.delete(id);
      }
    }
  }
};

module.exports = { Room, roomManager };
