# Style ideas (concepts, not shipped)

**Status: concepts only.** None of these is a mode you can pick today. Each is an idea to build and test one at a time: build one, make a real reel with it, check it against `docs/craft-playbook.md`, then keep it, change it or drop it. Until then, the three modes (Print, Depth, Talking) are the only options. Names are working names.

Every idea follows the craft playbook: one world, one through-line, a picture for each kind of line, nothing repeated three times.

---

## 1. The Counter Top

- **World:** a shop counter seen from above, with a till, a tray and a paper bag.
- **Through-line:** a receipt that prints longer line by line as the script goes on; the total at the bottom changes.
- **Picture per line:**
  - number: the total ticks on the receipt;
  - before/after: two receipts side by side;
  - list of three: three items slide into the bag;
  - warning: a red "VOID" stamp;
  - step: a coin is passed from tray to till;
  - price: the price label is stuck onto an item;
  - result: the receipt is torn off and handed over.
- **Typical length:** 25 to 35 s.
- **Mode:** Print.
- **Risk:** reads as a shopping story, so it suits only topics about cost, value or buying. A forced fit makes the objects feel arbitrary.

## 2. Slow Leak

- **World:** a glass water tank on a workbench.
- **Through-line:** the water level. It drops as a problem is explained and refills when the fix lands.
- **Picture per line:**
  - number: the level marker moves to a labelled tick;
  - mistake: a small crack opens and a drip starts;
  - comparison: two tanks, one leaking;
  - step: a valve is turned;
  - definition: the word is etched on the glass;
  - result: the tank full and still.
- **Typical length:** 20 to 30 s.
- **Mode:** Depth.
- **Risk:** water is hard to render convincingly, and a weak simulation looks cheap. Fall back to a stylised level with a shine rather than real fluid.

## 3. Drawer Wall

- **World:** a wall of small labelled drawers in a workshop.
- **Through-line:** drawers open one at a time and the items revealed stack up on a bench in front.
- **Picture per line:**
  - list of three: three drawers slide out together;
  - quote: a card is read out from inside a drawer;
  - definition: the label on the drawer is the term;
  - mistake: a drawer jams;
  - result: the bench holds the full set.
- **Typical length:** 30 to 40 s.
- **Mode:** Depth or Print.
- **Risk:** a wall of identical drawers is repetitive. Vary the open distance, the contents and the camera or it becomes one shot six times.

## 4. Trail Marker

- **World:** a winding hiking trail on a hand-drawn map that is unfolded on a table.
- **Through-line:** a small pin that travels along the trail, with stops along the way.
- **Picture per line:**
  - step: the pin hops to the next stop;
  - warning: a danger sign planted on the trail;
  - number: a distance or height flag;
  - comparison: two trail branches;
  - result: the pin arrives at the summit flag.
- **Typical length:** 25 to 40 s.
- **Mode:** Print.
- **Risk:** it is a process format. Topics without a clear sequence feel dragged along the path.

## 5. Mixing Desk

- **World:** an audio mixing desk with sliders and knobs.
- **Through-line:** sliders that move up or down on each point; the final setting is the answer.
- **Picture per line:**
  - number: a slider lands on a value;
  - comparison: two sliders, one high and one low;
  - mistake: a knob turned too far, a red meter;
  - list of three: three sliders move together;
  - ask: one big button lights up.
- **Typical length:** 20 to 30 s.
- **Mode:** Print or Depth.
- **Risk:** it suits "balance" topics (trade-offs, settings) and little else. Skip it if the advice is a single instruction.

## 6. Window Seat

- **World:** the view from a train window, with the scenery passing by.
- **Through-line:** a station board that updates with each point; stops tick off as the train goes on.
- **Picture per line:**
  - step: the next station name arrives;
  - number: a milepost flashes past;
  - warning: a signal turns red;
  - before/after: the same view at day then night;
  - result: arrival at the last station.
- **Typical length:** 30 to 45 s.
- **Mode:** Depth.
- **Risk:** building a moving scene costs a lot of render time, and the view may take attention away from the words. Keep the hero in the window frame, not the scenery.

## 7. The Desk Drop

- **World:** a presenter at a plain desk. Objects are dropped onto it from just above the frame.
- **Through-line:** the desk surface itself fills as items land; at the end it holds the full toolkit.
- **Picture per line:**
  - list of three: three objects are dropped in order;
  - quote: a sticky note pressed onto the desk;
  - price: a price tag clipped onto an object;
  - mistake: an object knocked off the desk;
  - ask: all items clear away except one.
- **Typical length:** 20 to 30 s.
- **Mode:** Talking.
- **Risk:** clutter. If the desk fills too much, the person is hidden, so cap the number of objects and clear the desk at each section break.

## 8. Pocket Lab

- **World:** a small lab bench with a beaker, a scale and a notebook.
- **Through-line:** a notebook that fills with ticked results as each test is run.
- **Picture per line:**
  - comparison: a scale tips toward the heavier side;
  - number: a reading appears on a dial;
  - before/after: two beakers, clear and cloudy;
  - mistake: a failed test, a crossed line in the notebook;
  - result: the final page, underlined.
- **Typical length:** 30 to 45 s.
- **Mode:** Print or Depth.
- **Risk:** it implies evidence. Any dial reading, percentage or test result needs a cleared fact, or an "example" tag, or the reel makes a claim it cannot support.

---

## How to test one

1. Pick one concept and the brand it fits.
2. Write a short script that has at least eight of the twelve kinds of line from the craft playbook.
3. Write the storyboard with the through-line named, then build only that reel.
4. Run `kit pace`, `kit effort`, `kit lint` and `kit qa`. Record what failed and why.
5. Keep, change or drop the idea. Do not add it to the mode list until one real reel passes the gates and the approver likes it.
