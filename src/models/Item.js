const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  itemId: Number,
  player: { type: Schema.Types.ObjectId, ref: 'Player' },
  isValid : Boolean
});

const Item = mongoose.model("Item", schema);

module.exports = {
  Item,
};
