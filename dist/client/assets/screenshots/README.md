# Screenshot Carousel Images

## 📸 How to Add Screenshots

Drop your app screenshots in this folder with the following naming convention:

```
screenshot-1.png
screenshot-2.png
screenshot-3.png
screenshot-4.png
screenshot-5.png
```

## 📋 Requirements

- **Format**: PNG or JPG
- **Aspect Ratio**: 9:19 (phone screen ratio)
- **Recommended Size**: 1080 x 2280 pixels
- **File Names**: Must be exactly as shown above (screenshot-1.png, screenshot-2.png, etc.)

## 🎯 Current Screenshots

- ✅ `screenshot-1.png` - Login screen (already added)
- ⬜ `screenshot-2.png` - Add your second screenshot here
- ⬜ `screenshot-3.png` - Add your third screenshot here
- ⬜ `screenshot-4.png` - Add your fourth screenshot here
- ⬜ `screenshot-5.png` - Add your fifth screenshot here

## 🔧 To Add More or Fewer Screenshots

If you want to add more than 5 screenshots or use fewer:

1. Add your images to this folder (screenshot-6.png, screenshot-7.png, etc.)
2. Open `public/download.html`
3. Find the `screenshots` array in the `<script>` section
4. Add or remove entries:

```javascript
const screenshots = [
  '/assets/screenshots/screenshot-1.png',
  '/assets/screenshots/screenshot-2.png',
  '/assets/screenshots/screenshot-3.png',
  '/assets/screenshots/screenshot-4.png',
  '/assets/screenshots/screenshot-5.png',
  '/assets/screenshots/screenshot-6.png',  // Add more like this
];
```

## 📱 Features

The carousel includes:
- ✅ Previous/Next navigation arrows
- ✅ Dot indicators showing current slide
- ✅ Fullscreen view button
- ✅ Keyboard navigation (arrow keys in fullscreen)
- ✅ Click outside to close fullscreen
- ✅ Responsive design (smaller on mobile)

## 🎨 Tips for Great Screenshots

1. **Show key features**: Login, POS, Products, Wallet, Reports
2. **Use real data**: Make it look authentic
3. **Clean UI**: Remove any test data or errors
4. **Good lighting**: Make sure screenshots are clear
5. **Consistent style**: All screenshots should look cohesive
