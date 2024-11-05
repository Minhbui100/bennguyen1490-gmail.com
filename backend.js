const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for cross-origin requests

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'Restaurant')));

/*
const pool = new Pool({
    user: 'aayushgupta',
    host: 'localhost',
    database: 'school',
    password: '2126',
    port: 5432,
});
*/

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'restaurant',
    password: 'postgres',
    port: 5433,
});

app.get('/', (req, res) => {
    res.send('Hello, World! hoho');
});

// Fetch data from PostgreSQL
app.get('/bill', async(req, res) => {
    try {
        await pool.query(`
            WITH numbered_bill AS (
                SELECT 
                    c.*,
                    ROW_NUMBER() OVER (ORDER BY c.bill_id) AS new_id
                FROM 
                    bill c
            )
            UPDATE bill
            SET bill_id = new_id
            FROM numbered_bill
            WHERE bill.bill_id = numbered_bill.bill_id;
        `);

        const result = await pool.query(`select * from bill`);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.get('/orders', async(req, res) => {
    try {
        await pool.query(`
            WITH numbered_order AS (
                SELECT 
                    c.*,
                    ROW_NUMBER() OVER (ORDER BY c.id) AS new_id
                FROM 
                    orders c
            )
            UPDATE orders
            SET id = new_id
            FROM numbered_order
            WHERE orders.id = numbered_order.id;
        `);

        const result = await pool.query(`select * from orders`);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.get('/cards', async(req, res) => {
    try {
        const result = await pool.query('SELECT * FROM cards');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.get('/customers', async(req, res) => {
    try {
        await pool.query(`
            WITH numbered_customer AS (
                SELECT 
                    c.*,
                    ROW_NUMBER() OVER (ORDER BY c.id) AS new_id
                FROM 
                    customers c
            )
            UPDATE customers
            SET id = new_id
            FROM numbered_customer
            WHERE customers.id = numbered_customer.id;
        `);

        const result = await pool.query('SELECT * FROM customers');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.get('/location', async(req, res) => {
    try {
        const result = await pool.query('SELECT * FROM location');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.get('/transaction', async(req, res) => {
    try {
        const result = await pool.query('SELECT * FROM transaction');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.post('/orders', async(req, res) => {
    const { id, name, price, quantity } = req.body;

    // Check if both id and name are provided
    if (!id || !name || !price || !quantity) {
        return res.status(400).send("ID, name, price and quantiry are required");
    }

    try {
        const result = await pool.query(
            'SELECT paid FROM bill WHERE bill_id = $1', [id]
        );

        // If the bill is already paid, send a response and exit the function
        if (result.rows.length > 0 && result.rows[0].paid === true) {
            return res.status(400).send('Warning: The bill ID is already paid');
        }

        const billCheck = await pool.query('SELECT 1 FROM Bill WHERE bill_id = $1', [id]);
        if (billCheck.rowCount === 0) {
            await pool.query(
                'INSERT INTO Bill (bill_id) VALUES ($1)', [id] // Default values for total and tax
            );
        }
        await pool.query('INSERT INTO orders (bill_id, name, price, quantity) VALUES ($1, $2, $3, $4)', [id, name, price, quantity]);
        await pool.query('UPDATE Bill SET total = (SELECT COALESCE(SUM(price * quantity), 0) FROM Orders WHERE Orders.bill_id = Bill.bill_id);');
        await pool.query('UPDATE Bill SET tax = total * 0.0825;')
        res.sendStatus(201); // Successfully created
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

app.delete('/orders/:id', async(req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT bill_id FROM Orders WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const orderId = result.rows[0].bill_id;

        const result1 = await pool.query(
            'SELECT paid FROM bill WHERE bill_id = $1', [orderId]
        );
        if (result1.rows.length > 0 && result1.rows[0].paid === true) {
            return res.status(400).send('Warning: The bill ID is already paid');
        }

        await pool.query('DELETE FROM orders WHERE id = $1', [id]);
        await pool.query('UPDATE Bill SET total = (SELECT COALESCE(SUM(price * quantity), 0) FROM Orders WHERE Orders.bill_id = Bill.bill_id);');
        await pool.query(`UPDATE Bill SET tax = total * 0.0825`);
        // Step 4: Check if there are any remaining orders with this order_id
        const orderCheck = await pool.query('SELECT 1 FROM Orders WHERE bill_id = $1', [orderId]);
        if (orderCheck.rowCount === 0) {
            // Step 5: Delete the Bill record if no more orders exist for this order_id
            await pool.query('DELETE FROM Bill WHERE bill_id = $1', [orderId]);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

//transaction
app.put('/bill/:bill_id', async(req, res) => {
    const { bill_id } = req.params;
    const { customerId, cardId } = req.body;
    try {
        const result = await pool.query(
            'SELECT paid FROM bill WHERE bill_id = $1', [bill_id]
        );

        // If the bill is already paid, send a response and exit the function
        if (result.rows.length > 0 && result.rows[0].paid === true) {
            return res.status(400).send('Warning: The bill ID is already paid');
        }

        await pool.query(
            'UPDATE bill SET cust_id = $1, card_id = $2, paid = TRUE WHERE bill_id = $3', [customerId, cardId, bill_id]
        );
        await pool.query(
            'UPDATE customers SET membership_point=membership_point+1 WHERE id = $1', [customerId]
        );
        res.sendStatus(200);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

/*

// Update student name by ID
app.put('/students/:id', async(req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        await pool.query('UPDATE students SET name = $1 WHERE id = $2', [name, id]);
        res.sendStatus(200);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

// Add a new student
app.post('/students', async(req, res) => {
    const { id, name } = req.body;

    // Check if both id and name are provided
    if (!id || !name) {
        return res.status(400).json({ error: "ID and name are required" });
    }

    try {
        await pool.query('INSERT INTO students (id, name) VALUES ($1, $2)', [id, name]);
        res.sendStatus(201); // Successfully created
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

// Delete a student by ID
app.delete('/students/:id', async(req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM students WHERE id = $1', [id]);
        res.sendStatus(200);
    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});
*/
// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
