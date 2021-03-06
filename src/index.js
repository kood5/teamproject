const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");

const {
  constantManager,
  mapManager,
  monsterManager,
  itemManager
} = require("./datas/Manager");
const { Player } = require("./models/Player");
const { Item } = require("./models/Item");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.engine("html", require("ejs").renderFile);

mongoose.connect(
    "mongodb+srv://test0:test0@testmongo.nwu7w.mongodb.net/gameServer?retryWrites=true&w=majority",
    { useNewUrlParser: true, useUnifiedTopology: true }
);

const encryptPassword = (password) => {
  return crypto.createHash("sha512").update(password).digest("base64");
};

const authentication = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.sendStatus(401);
  const [bearer, key] = authorization.split(" ");
  if (bearer !== "Bearer") return res.sendStatus(401);
  const player = await Player.findOne({ key });
  if (!player) return res.sendStatus(401);

  req.player = player;
  next();
};

app.get("/", (req, res) => {
  res.render("index", { gameName: constantManager.gameName });
});

app.get("/game", (req, res) => {
  res.render("game");
});

app.post(
    "/signup",
    body("email").isEmail().isLength({ max: 99 }),
    body("name").isLength({ min: 2, max: 12 }),
    body("password").isLength({ min: 8, max: 16 }),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const { email, password, name } = req.body;
      if (await Player.exists({ email })) {
        return res.status(400).json({ error: "Player already exists" });
      }
      const encryptedPassword = encryptPassword(password);
      const player = new Player({
        email: email,
        password: encryptedPassword,
        name: name,
        level: 1,
        exp: 0,
        maxHP: 100,
        HP: 100,
        str: 5,
        def: 5,
        x: 0,
        y: 0
      });
      const key = crypto.randomBytes(24).toString("hex");
      player.key = key;
      await player.save();

      return res.send({ key });
    }
);

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const encryptedPassword = encryptPassword(password);
  const player = await Player.findOne({ email, password: encryptedPassword });

  if (player === null) return res.sendStatus(404);
  const key = player.key;
  return res.send({ key });
});

app.post("/action", authentication, async (req, res) => {
  const { action } = req.body;
  const player = req.player;
  let event = null;
  let field = null;
  let actions = [];
  let validItem = [];
  if (action === "query") {
    field = mapManager.getField(req.player.x, req.player.y);
  } else if (action === "move") {
    const direction = parseInt(req.body.direction, 0); // 0 ???. 1 ??? . 2 ???. 3 ???.
    let x = req.player.x;
    let y = req.player.y;
    if (direction === 0) {
      x += 1;
    } else if (direction === 1) {
      x -= 1;
    } else if (direction === 2) {
      y += 1;
    } else if (direction === 3) {
      y -= 1;
    } else {
      res.sendStatus(400);
    }
    field = mapManager.getField(x, y);
    if (!field) res.sendStatus(400);
    player.x = x;
    player.y = y;

    const events = field.events;
    const actions = [];
    if (events.length > 0) {
      // TODO : ???????????? ????????? ??????????????? ??????
      const eventPercent = Math.random() * 100;

      let _event = events[0];
      if (events[0].percent < eventPercent) {
        _event = events[1];
      }

      if (_event.type === "battle") {
        // TODO: ????????? ?????? events.json ?????? ????????? ????????? ??????
        const monster = monsterManager.getMonster(_event.monster);
        // ??????????????? ??????????????? ???????????? ????????? ????????? ??????????????? ?????? ??????

        let attackCounts;
        if (player.str <= monster.def) {
          attackCounts = monster.hp;
        } else {
          attackCounts = Math.ceil(monster.hp / (player.str - monster.def));
        }

        let playerDamaged;
        if (player.def >= monster.str) {
          playerDamaged = attackCounts * -1;
        } else {
          playerDamaged = attackCounts * (player.def - monster.str);
        }

        player.incrementHP(playerDamaged);
        //????????? ?????????
        if (player.HP <= 0) {
          player.HP = 100;
          player.x = 0;
          player.y = 0;
          //???????????? ????????? ??????
          let items = await Item.find({ player, isValid: true });
          if (items.length > 0) {
            let deletedItem = items[Math.floor(Math.random() * items.length)];
            deletedItem.isValid = false;
            await deletedItem.save();

            player.str -= itemManager.getItem(deletedItem.itemId).str;
            player.def -= itemManager.getItem(deletedItem.itemId).def;
            event = {
              description: `${monster.name}??? ????????????.\n???????????? ${
                  itemManager.getItem(deletedItem.itemId).name
              }??? ???????????????.\n0,0?????? ????????????.`
            };
          } else {
            event = {
              description: `${monster.name}??? ????????????.\n???????????? 0,0?????? ????????????.`
            };
          }
        } else {
          player.incrementEXP(parseInt(monster.exp));
          // ????????? 100 ????????? ?????????
          if (player.exp >= 100) {
            player.level += 1;
            player.str += 1;
            player.def += 1;
            player.exp -= 100;
            event = {
              description: `${monster.name}??? ????????????. \n ${playerDamaged} ?????? ????????? ?????????. 
              \n ???????????? ????????? ???????????? ${monster.exp}?????? ?????????.\n????????? 1 ???????????? str ??? def ??? 1?????? ????????????.`
            };
          } else {
            event = {
              description: `${monster.name}??? ????????????.\n ${playerDamaged} ?????? ????????? ?????????. 
              \n ???????????? ????????? ???????????? ${monster.exp}?????? ?????????.`
            };
          }
        }
      } else if (_event.type === "item") {
        const item = itemManager.getItem(_event.item);

        const playerItem = new Item({ itemId: item.id, player, isValid: true });
        playerItem.save();

        player.incrementSTR(item.str);
        player.incrementDEF(item.def);

        event = {
          description: `${item.name}??? ????????????\n str???${item.str}, def???${item.def}?????? ????????????.`
        };
      } else if (_event.type === "heal") {
        event = { description: `HP??? 10?????? ????????????.` };
        player.incrementHP(10);
      } else if (_event.type === "nothing") {
        event = { description: `???????????? ???????????? ?????????.` };
      }
      else if(_event.type === "start" || _event.type==="end"){
        event = {description: ''};
      }
    }

    await player.save();
  }
  const EWSN = ["???", "???", "???", "???"];
  field = mapManager.getField(req.player.x, req.player.y);
  field.canGo.forEach((direction, i) => {
    if (direction === 1) {
      actions.push({
        url: "/action",
        text: EWSN[i],
        params: { direction: i, action: "move" }
      });
    }
  });

  const items = await Item.find({ player, isValid: true });
  for (const item of items) {
    validItem.push(itemManager.getItem(item.itemId).name);
  }
  return res.send({ player, field, event, actions, validItem });
});

app.listen(3000);
