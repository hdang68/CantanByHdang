# Catan Classic Online Multiplayer

Game Catan Classic trực tuyến nhiều người chơi thời gian thực, xây dựng bằng Node.js, Express, Socket.IO và HTML5/CSS3/SVG thuần.

---

## Yêu cầu môi trường
- **Node.js**: Phiên bản 18+ hoặc 20+ LTS (khuyên dùng Node 20/22/24).
- **Trình duyệt web**: Chrome, Firefox, Edge, Safari hiện đại có hỗ trợ ES Modules và SVG.

---

## Cài đặt và Khởi chạy

1. **Cài đặt thư viện dependencies:**
   ```bash
   npm install
   ```

2. **Chạy máy chủ ở môi trường phát triển (Dev Mode):**
   ```bash
   npm run dev
   ```
   *(Sử dụng tính năng `--watch` tự động tải lại khi sửa file)*

3. **Chạy máy chủ ở môi trường thông thường (Production):**
   ```bash
   npm start
   ```

4. **Chạy kiểm thử tự động (Unit / Integration Tests):**
   ```bash
   npm test
   ```

5. **Truy cập ứng dụng:**
   Mở trình duyệt và truy cập: `http://localhost:3000`

---

## Cấu trúc dự án
- `src/server.js`: Khởi tạo Express và Socket.IO Server.
- `src/rooms.js`: Quản lý danh sách phòng, người chơi và mã phiên (Session).
- `src/socketHandlers.js`: Bộ định tuyến sự kiện Socket.IO.
- `public/`: Giao diện người dùng (HTML, CSS, ES Modules).
- `tests/`: Bộ kiểm thử tự động.
