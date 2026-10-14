# HƯỚNG DẪN ĐẶT FILE ẢNH CHO CATAN CLASSIC ONLINE

Thư mục `public/assets/` chứa toàn bộ hình ảnh đồ họa của trò chơi. Bạn có thể tự do thay thế hoặc thêm các file ảnh thực tế của riêng mình (ảnh vẽ, ảnh chụp board game thật, ảnh AI generate, tranh minh họa...).

---

## 1. Cấu trúc thư mục

```text
public/assets/
├── background/            # Ảnh nền trang web / mặt bàn chơi game
│   ├── table_background.png (hoặc .jpg, .webp, .svg)
│   └── table_background.svg (ảnh mặc định có sẵn)
├── ocean/                 # Ảnh nền biển bao quanh đảo Catan
│   ├── ocean_background.png (hoặc .jpg, .webp, .svg)
│   └── ocean_background.svg (ảnh mặc định có sẵn)
├── terrains/              # Ảnh 6 loại địa hình ô lục giác
│   ├── forest.png         # Rừng (Sản xuất Gỗ)
│   ├── hills.png          # Đồi (Sản xuất Đất sét)
│   ├── pasture.png        # Đồng cỏ (Sản xuất Cừu)
│   ├── fields.png         # Đồng bằng (Sản xuất Lúa mì)
│   ├── mountains.png      # Núi (Sản xuất Quặng)
│   ├── desert.png         # Sa mạc (Tên cướp đứng)
│   └── *.svg              # Các file vector mặc định có sẵn
└── buildings/             # Ảnh hoặc icon công trình (tùy chọn)
```

---

## 2. Thông số kỹ thuật đề xuất cho từng loại ảnh

### A. Ảnh mặt bàn (`assets/background/`)
- **Tên file ưu tiên:** `table_background.png` hoặc `table_background.jpg`
- **Kích thước đề xuất:** `1920x1080` pixel hoặc `2560x1440` (Tỷ lệ 16:9).
- **Chủ đề gợi ý:** Mặt bàn gỗ sồi, bàn da, vải dạ bàn board game, hoặc bản đồ cổ.

### B. Ảnh nền biển (`assets/ocean/`)
- **Tên file ưu tiên:** `ocean_background.png` hoặc `ocean_background.jpg`
- **Kích thước đề xuất:** `1000x1000` pixel (Hình vuông).
- **Chủ đề gợi ý:** Mặt nước biển xanh thẳm, sóng nước, bản đồ hải trình cổ có la bàn.

### C. Ảnh 6 loại địa hình (`assets/terrains/`)
- **Định dạng:** PNG (khuyên dùng có nền trong suốt hoặc hình vuông), WebP hoặc SVG.
- **Kích thước đề xuất:** `512x512` pixel (hoặc tối thiểu `300x300` pixel).
- **Tên file chính xác:**
  1. `forest.png`: Rừng thông, cây cối xanh mướt (Gỗ).
  2. `hills.png`: Đồi đất đỏ, mỏ đất sét, gạch nung (Đất sét).
  3. `pasture.png`: Đồng cỏ xanh non, đàn cừu gặm cỏ (Cừu).
  4. `fields.png`: Cánh đồng lúa mì vàng ươm, bó lúa (Lúa mì).
  5. `mountains.png`: Dãy núi đá xám, đỉnh tuyết trắng, quặng sắt (Quặng).
  6. `desert.png`: Cồn cát sa mạc vàng cam, xương rồng, nắng chói (Sa mạc).

---

## 3. Cơ chế tự động nhận diện và Fallback

- Hệ thống được lập trình với cơ chế **Graceful Fallback**:
  1. Trình duyệt sẽ ưu tiên tải file `.png` bạn đặt vào thư mục (`forest.png`, `hills.png`, v.v.).
  2. Nếu bạn chưa đặt file `.png`, hệ thống sẽ tự động dùng file `.svg` vẽ sẵn tuyệt đẹp đi kèm.
  3. Nếu file ảnh gặp lỗi tải mạng, hệ thống tự động hiển thị màu sắc bàn cờ tiêu chuẩn để đảm bảo ván chơi không bao giờ bị gián đoạn.
- **Cách áp dụng:** Bạn chỉ cần copy/paste file ảnh của bạn vào đúng thư mục và đặt đúng tên file như danh sách trên, sau đó tải lại trang web (F5) là ảnh mới sẽ tự động hiển thị!
