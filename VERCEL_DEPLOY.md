# Vercel Deployment Notları

## 🚀 İlk Deployment

1. GitHub'a push edin
2. Vercel'de "Import Project" tıklayın
3. Environment Variables ekleyin:
   ```
   VITE_42_CLIENT_ID=your_client_id
   VITE_42_CLIENT_SECRET=your_client_secret
   VITE_42_REDIRECT_URI=https://yourdomain.vercel.app/callback
   ```

4. Deploy edin!

## 🔄 Sonraki Deploymentlar

Her git push otomatik olarak deploy edilir.

## 🌐 42 OAuth Redirect URI

Production domain'inizi 42 OAuth uygulamanıza ekleyin:
- `https://yourdomain.vercel.app/callback`

## 📝 Local Development

```bash
# Vercel dev server kullanın (serverless functions için gerekli)
vercel dev

# Port: http://localhost:3000
```
