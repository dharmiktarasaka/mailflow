# Solving SPA Reload 404 (Page Not Found) on Hostinger

This issue occurs because Single Page Applications (SPAs) like React use client-side routing (e.g. `react-router-dom`). 
- When you click links in the UI, React Router updates the URL *without* making a request to the server.
- When you refresh the browser (e.g., at `/campaigns`), the browser sends a direct request to Hostinger for a folder or file named `/campaigns`. Because that static directory doesn't exist on the server, Hostinger returns a `404 Not Found` error.

To resolve this, we must instruct the web server to redirect all requests to `/index.html` so that React Router can handle them.

---

## Solution 1: Hostinger Shared / Cloud Hosting (Apache / LiteSpeed)
This is the most common Hostinger setup. Apache uses a `.htaccess` file in your root folder (`public_html`).

1. **Automatic Build Integration** (Done):
   We have added a `.htaccess` file to `client/public/.htaccess` in the source code.
   Now, whenever you run `npm run build` inside the `client` folder, Vite will automatically bundle `.htaccess` directly into the `client/dist/` output folder.
2. **Deploy**:
   - Re-run the frontend build:
     ```bash
     npm run build
     ```
   - Re-upload all files from the `client/dist` folder to your Hostinger `public_html` directory. Ensure the `.htaccess` file is copied to the root of `public_html`.

---

## Solution 2: Hostinger VPS (Nginx Setup)
If your Hostinger VPS is running Nginx as the web server, you need to modify your Nginx site configuration file (typically found in `/etc/nginx/sites-available/default` or `/etc/nginx/conf.d/`):

1. Open your Nginx configuration.
2. Inside the `server` block for your website, update the `location /` block:
   ```nginx
   server {
       listen 80;
       server_name mailflow.yourdomain.com;
       root /var/www/mailflow/client/dist;

       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```
3. Restart Nginx to apply changes:
   ```bash
   sudo systemctl restart nginx
   ```
