import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Student from '../models/Student.js';
import Parent from '../models/Parent.js';
import Schedule from '../models/Schedule.js';
import Update from '../models/Update.js';

dotenv.config();

const locations = [
  'Tallinn',
  'Tartu',
  'Narva',
  'Pärnu',
  'Viljandi',
  'Rakvere',
  'Kuressaare',
  'Haapsalu',
  'Paide',
  'Jõhvi',
];

const groupNames = [
  'Laste Tantsugrupp',
  'Noorte Tantsugrupp',
  'Kontemporaarne Tants',
  'Balleti Algajad',
  'Balleti Edasijõudnud',
  'Latinod Tants',
  'Hip-Hop Tants',
  'Tantsutrükid',
  'Reedete Tantsugrupp',
  'Kontsertgrupp',
];

const firstNames = [
  'Maria', 'Anna', 'Laura', 'Kadri', 'Liisa', 'Kati', 'Maarja', 'Kristiina',
  'Mart', 'Jaan', 'Toomas', 'Marten', 'Karl', 'Rasmus', 'Kristjan', 'Markus',
];

const lastNames = [
  'Tamm', 'Saar', 'Sepp', 'Mägi', 'Kask', 'Rebane', 'Ilves', 'Kõiv',
  'Lepik', 'Kukk', 'Pärn', 'Laas', 'Veski', 'Kangur', 'Käär', 'Lipp',
];

const parentFirstNames = [
  'Ene', 'Tiina', 'Kadri', 'Merike', 'Kersti', 'Piret', 'Marika', 'Katrin',
  'Jüri', 'Tarmo', 'Andres', 'Raivo', 'Ülo', 'Peeter', 'Toivo', 'Aivar',
];

// Generate random date within last year
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Generate random time
const randomTime = () => {
  const hours = Math.floor(Math.random() * 12) + 14; // 2 PM to 11 PM
  const minutes = Math.random() < 0.5 ? '00' : '30';
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tantsukool');
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Group.deleteMany({});
    await Student.deleteMany({});
    await Parent.deleteMany({});
    await Schedule.deleteMany({});
    await Update.deleteMany({});

    // Create admin user
    console.log('Creating admin user...');
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@voimlepehmelt.ee',
      password: 'admin123',
      role: 'admin',
    });

    // Create teacher users
    console.log('Creating teacher users...');
    const teachers = [];
    for (let i = 0; i < 5; i++) {
      const teacher = await User.create({
        name: `Õpetaja ${i + 1}`,
        email: `teacher${i + 1}@voimlepehmelt.ee`,
        password: 'teacher123',
        role: 'teacher',
      });
      teachers.push(teacher);
    }

    // Create groups
    console.log('Creating groups...');
    const groups = [];
    for (let i = 0; i < 10; i++) {
      const group = await Group.create({
        name: groupNames[i],
        location: locations[i],
        description: `${groupNames[i]} asub ${locations[i]}s.`,
        teachers: [teachers[i % teachers.length]._id],
      });
      groups.push(group);

      // Assign group to teacher
      teachers[i % teachers.length].assignedGroups.push(group._id);
      await teachers[i % teachers.length].save();
    }

    // Create parents and students
    console.log('Creating parents and students...');
    const allParents = [];
    const allStudents = [];

    for (const group of groups) {
      // Create 8-15 students per group
      const studentCount = Math.floor(Math.random() * 8) + 8;

      for (let i = 0; i < studentCount; i++) {
        // Create parent
        const parentFirstName = parentFirstNames[Math.floor(Math.random() * parentFirstNames.length)];
        const parentLastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const parentEmail = `${parentFirstName.toLowerCase()}.${parentLastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@example.com`;

        let parent = allParents.find(p => p.email === parentEmail);
        if (!parent) {
          parent = await Parent.create({
            firstName: parentFirstName,
            lastName: parentLastName,
            email: parentEmail,
            phone: `+372 ${Math.floor(Math.random() * 9000) + 5000}${Math.floor(Math.random() * 10000)}`,
          });
          allParents.push(parent);
        }

        // Create student
        const studentFirstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const studentLastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const age = Math.floor(Math.random() * 10) + 6; // Age 6-15

        const student = await Student.create({
          firstName: studentFirstName,
          lastName: studentLastName,
          age: age,
          group: group._id,
          parent: parent._id,
          enrollmentDate: randomDate(new Date(2023, 0, 1), new Date()),
        });

        allStudents.push(student);

        // Add student to group
        group.students.push(student._id);
        await group.save();

        // Add student to parent
        parent.students.push(student._id);
        await parent.save();
      }
    }

    // Create schedules
    console.log('Creating schedules...');
    for (const group of groups) {
      // Create 2-4 future schedules per group
      const scheduleCount = Math.floor(Math.random() * 3) + 2;

      for (let i = 0; i < scheduleCount; i++) {
        const date = new Date();
        date.setDate(date.getDate() + Math.floor(Math.random() * 30) + 1); // Next 30 days
        const startTime = randomTime();
        const endHours = parseInt(startTime.split(':')[0]) + 1;
        const endTime = `${endHours.toString().padStart(2, '0')}:${startTime.split(':')[1]}`;

        await Schedule.create({
          group: group._id,
          title: 'Tantsutrenn',
          date: date,
          startTime: startTime,
          endTime: endTime,
          location: group.location,
          description: `Regulaarne tantsutrenn ${group.name} grupi jaoks.`,
        });
      }
    }

    // Create some updates
    console.log('Creating updates...');
    for (const group of groups) {
      const updateCount = Math.floor(Math.random() * 3) + 2;

      for (let i = 0; i < updateCount; i++) {
        const teacher = teachers[groups.indexOf(group) % teachers.length];
        const content = [
          `Tere! Täna oli meil suurepärane tantsutrenn. ${group.name} näitas suurepärast edusammudest!`,
          `Meenutame, et järgmine tantsutrenn toimub järgmisel nädalal. Palun ärge unustage!`,
          `Tänan kõiki, kes osalesid eelmisel nädalal. Olete suurepärased!`,
          `Uus koreograafia on valmis! Ootame teid järgmisele treeningule.`,
        ][Math.floor(Math.random() * 4)];

        await Update.create({
          group: group._id,
          author: teacher._id,
          content: content,
          media: [],
          comments: [],
        });
      }
    }

    console.log('✅ Data seeding completed successfully!');
    console.log(`Created:`);
    console.log(`- 1 admin user (admin@tantsukool.ee / admin123)`);
    console.log(`- ${teachers.length} teacher users (teacher1@tantsukool.ee / teacher123, etc.)`);
    console.log(`- ${groups.length} groups`);
    console.log(`- ${allParents.length} parents`);
    console.log(`- ${allStudents.length} students`);
    console.log(`- Schedules for all groups`);
    console.log(`- Updates for all groups`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();

