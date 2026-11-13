FROM nginx:1.30-alpine
# The config is baked into the image: no single-file bind mount (those pin the inode and go stale).
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html privacy.html terms.html support.html site.css /usr/share/nginx/html/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY img/ /usr/share/nginx/html/img/
