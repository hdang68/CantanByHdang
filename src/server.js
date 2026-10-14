import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socketHandlers.js';
import { createStandardBoard, createRandomBoard } from './game/board.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Cấu hình Socket.IO với CORS hỗ trợ kết nối từ client
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Phục vụ các file tĩnh trong thư mục public
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Route kiểm tra trạng thái sức khỏe của Server (Health Check)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'Catan Classic Online',
    timestamp: Date.now()
  });
});

// API phục vụ dữ liệu bàn cờ tiêu chuẩn
app.get('/api/board/standard', (req, res) => {
  const board = createStandardBoard();
  res.json(board);
});

// API tạo bàn cờ ngẫu nhiên hợp lệ (6 và 8 không kề nhau)
app.get('/api/board/random', (req, res) => {
  const board = createRandomBoard();
  res.json(board);
});

// Cấu hình các socket handlers
setupSocketHandlers(io);

// Lắng nghe cổng PORT (mặc định 3000 hoặc biến môi trường cho Cloud Hosting)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`  CATAN CLASSIC ONLINE SERVER READY`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=========================================`);
});

// Xử lý bắt lỗi toàn cục tránh crash tiến trình
process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server Unhandled Rejection]:', reason);
});

