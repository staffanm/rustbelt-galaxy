// Ninety-nine captains, admirals, emperors and other leaders of science fiction, from the worst to the best. The end
// screen places the player among them, which makes a hundred. The order is an opinion, and the point is the fun.
// At most 10 are from Star Trek, and at most half are human or descended from humans ("human" below).

export interface Captain {
  name: string;
  source: string;
  human: boolean;
}

const c = (name: string, source: string, human = false): Captain => ({ name, source, human });

export const CAPTAINS: Captain[] = [
  // The worst: lost the ship, the war, or the plot. The best at the end.
  c('Dark Helmet', 'Spaceballs', true),
  c('Emperor Cartagia', 'Babylon 5'),
  c('Dr. Zachary Smith', 'Lost in Space', true),
  c('Zapp Brannigan', 'Futurama', true),
  c('Jar Jar Binks', 'Star Wars'),
  c('Stanley Tweedle', 'Lexx', true),
  c('President Skroob', 'Spaceballs', true),
  c('Prostetnic Vogon Jeltz', "The Hitchhiker's Guide to the Galaxy"),
  c('Gaius Baltar', 'Battlestar Galactica', true),
  c('Captain Qwark', 'Ratchet & Clank'),
  c('Admiral Ozzel', 'Star Wars', true),
  c('Nute Gunray', 'Star Wars'),
  c('Invader Zim', 'Invader Zim'),
  c('The Almighty Tallest', 'Invader Zim'),
  c('Lrrr of Omicron Persei 8', 'Futurama'),
  c('Kang and Kodos', 'The Simpsons'),
  c('Arnold Rimmer', 'Red Dwarf', true),
  c('Commander Kruge', 'Star Trek III'),
  c('Sarris', 'Galaxy Quest'),
  c('Xur', 'The Last Starfighter'),
  c('Lord Zedd', 'Power Rangers'),
  c('Prince Vultan', 'Flash Gordon'),
  c('Ming the Merciless', 'Flash Gordon'),
  c('General Grievous', 'Star Wars'),
  c('Captain Phasma', 'Star Wars', true),
  c('Dominar Rygel XVI', 'Farscape'),
  c('Marco Inaros', 'The Expanse', true),
  c('Apophis', 'Stargate SG-1'),
  c('The Martian Ambassador', 'Mars Attacks!'),
  c('Starscream', 'Transformers'),
  c('Ronan the Accuser', 'Guardians of the Galaxy'),
  c('Gantu', 'Lilo & Stitch'),
  c('Jabba the Hutt', 'Star Wars'),
  c('Dave Lister', 'Red Dwarf', true),
  c('Kylo Ren', 'Star Wars', true),
  c('Peter Quill', 'Guardians of the Galaxy', true),
  c('Gul Dukat', 'Star Trek: Deep Space Nine'),
  c('Lone Starr', 'Spaceballs', true),
  c('Jason Nesmith', 'Galaxy Quest', true),
  c('Colonel Quaritch', 'Avatar', true),
  c('John Crichton', 'Farscape', true),
  c('Alex Rogan', 'The Last Starfighter', true),
  c('Arcturus Mengsk', 'StarCraft', true),
  c('Grand Moff Tarkin', 'Star Wars', true),
  c('Davros', 'Doctor Who'),
  c('The Master', 'Doctor Who'),
  c('Scorpius', 'Farscape'),
  c('Saren Arterius', 'Mass Effect'),
  c("Ba'al", 'Stargate SG-1'),
  c('Megatron', 'Transformers'),
  c('Khan Noonien Singh', 'Star Trek II', true),
  c('Darth Vader', 'Star Wars', true),
  c('Zaphod Beeblebrox', "The Hitchhiker's Guide to the Galaxy"),
  c('Johnny Rico', 'Starship Troopers', true),
  c("Jack O'Neill", 'Stargate SG-1', true),
  c('Londo Mollari', 'Babylon 5'),
  c("Aria T'Loak", 'Mass Effect'),
  c('Fox McCloud', 'Star Fox'),
  c('Captain Amelia', 'Treasure Planet'),
  c('Hondo Ohnaka', 'Star Wars'),
  c('Malcolm Reynolds', 'Firefly', true),
  c('Captain Harlock', 'Space Pirate Captain Harlock', true),
  c('Camina Drummer', 'The Expanse', true),
  c('Sarah Kerrigan', 'StarCraft', true),
  c('Captain Sulu', 'Star Trek VI', true),
  c("Teal'c", 'Stargate SG-1'),
  c('James Holden', 'The Expanse', true),
  c('Mathesar', 'Galaxy Quest'),
  c('Captain McCrea', 'WALL-E', true),
  c('Ellen Ripley', 'Alien', true),
  c('Laura Roslin', 'Battlestar Galactica', true),
  c('Emperor Palpatine', 'Star Wars', true),
  c('Thanos', 'Avengers: Infinity War'),
  c('Hera Syndulla', 'Star Wars Rebels'),
  c('Urdnot Wrex', 'Mass Effect'),
  c('Demeisen', 'Surface Detail'),
  c('Paul Atreides', 'Dune', true),
  c('Yoda', 'Star Wars'),
  c("G'Kar", 'Babylon 5'),
  c("The Arbiter, Thel 'Vadam", 'Halo'),
  c('Char Aznable', 'Mobile Suit Gundam', true),
  c('Thor', 'Stargate SG-1'),
  c('Artanis', 'StarCraft'),
  c('Martok', 'Star Trek: Deep Space Nine'),
  c('Honor Harrington', 'Honor Harrington', true),
  c('Kathryn Janeway', 'Star Trek: Voyager', true),
  c('Benjamin Sisko', 'Star Trek: Deep Space Nine', true),
  c('Admiral Ackbar', 'Star Wars'),
  c('Commander Shepard', 'Mass Effect', true),
  c('Grand Admiral Thrawn', 'Star Wars'),
  c('Delenn', 'Babylon 5'),
  c('Reinhard von Lohengramm', 'Legend of the Galactic Heroes', true),
  c('Yang Wen-li', 'Legend of the Galactic Heroes', true),
  c('Optimus Prime', 'Transformers'),
  c('James T. Kirk', 'Star Trek', true),
  c('Chrisjen Avasarala', 'The Expanse', true),
  c('William Adama', 'Battlestar Galactica', true),
  c('John Sheridan', 'Babylon 5', true),
  c('Jean-Luc Picard', 'Star Trek: The Next Generation', true),
];

// Where the player stands, as a share from 0 (the worst) to 1 (the best), from the result of the game.
// A win ranks in the top quarter, sooner is better. A loss ranks by the score against the best score, and an
// eliminated faction ranks in the bottom third.
export function leadership(won: boolean, eliminated: boolean, turn: number, myScore: number, bestScore: number): number {
  if (won) {
    const speed = Math.max(0, Math.min(1, (220 - turn) / 140));
    return 0.76 + 0.24 * speed;
  }
  const share = bestScore > 0 ? Math.max(0, Math.min(1, myScore / bestScore)) : 0;
  if (eliminated) return 0.02 + 0.28 * share;
  return 0.1 + 0.62 * share;
}

// The slot of the player in the list: the number of captains that rank below the player.
export function slotOf(share: number): number {
  return Math.max(0, Math.min(CAPTAINS.length, Math.round(share * CAPTAINS.length)));
}
