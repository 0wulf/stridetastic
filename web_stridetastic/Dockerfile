FROM node:20

WORKDIR /app

COPY ./web_stridetastic .
COPY ./.env ./.env.local
RUN npm install
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]