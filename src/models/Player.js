const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const schema = new Schema({
  email: {type: String, unique: true },
  password: String,
  name: String,
  key: String,

  level: Number,
  exp: Number,

  item: [{ type: Schema.Types.ObjectId, ref: 'Item' }],

  maxHP: { type: Number, default: 10 },
  HP: { type: Number, default: 10 },
  str: { type: Number, default: 5 },
  def: { type: Number, default: 5 },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 }
});
schema.methods.incrementHP = function (val) {
  const hp = this.HP + val;
  this.HP = Math.min(Math.max(0, hp), this.maxHP);
};

schema.methods.incrementSTR = function (val) {
  this.str += val;
};

schema.methods.incrementDEF = function (val) {
  this.def += val;
};

schema.methods.incrementEXP = function (val) {
  this.exp += val;
};

const Player = mongoose.model("Player", schema);

module.exports = {
  Player
};
