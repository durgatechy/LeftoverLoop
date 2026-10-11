
from flask import Flask, render_template, request, redirect, url_for, flash
from werkzeug.utils import secure_filename
import sqlite3
from pathlib import Path
from datetime import date
import uuid

app = Flask(__name__)
app.secret_key = "leftoverloop-demo"
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB maximum
app.config["UPLOAD_FOLDER"] = str(
    Path(__file__).resolve().parent / "static" / "uploads"
)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "leftoverloop.db"


# Connect to the SQLite database
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# Create database tables automatically
def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS food_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                donor_name TEXT NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                quantity TEXT NOT NULL,
                offer_type TEXT NOT NULL
                    CHECK (offer_type IN ('free', 'sale')),
                price REAL NOT NULL DEFAULT 0,
                pickup_location TEXT NOT NULL,
                available_until TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'available'
            )
        """)

        # Add new columns without deleting existing food records
        columns = {
            row["name"]
            for row in conn.execute(
                "PRAGMA table_info(food_items)"
            ).fetchall()
        }

        if "contact_number" not in columns:
            conn.execute(
                "ALTER TABLE food_items ADD COLUMN contact_number TEXT DEFAULT ''"
            )

        if "image_filename" not in columns:
            conn.execute(
                "ALTER TABLE food_items ADD COLUMN image_filename TEXT DEFAULT ''"
            )

        conn.execute("""
            CREATE TABLE IF NOT EXISTS food_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                food_id INTEGER NOT NULL,
                requester_name TEXT NOT NULL,
                organization TEXT DEFAULT '',
                message TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                FOREIGN KEY (food_id)
                    REFERENCES food_items(id) ON DELETE CASCADE
            )
        """)


# Python data structures for the project
# Dictionary: stores food listings currently loaded from SQLite
food_items = {}

# List: stores requests currently loaded from SQLite
food_requests = []

# Set: stores unique food categories
food_categories = set()

# List: stores recent activity for the current run
activity_history = []


def refresh_data():
    """Load database records into Python data structures."""
    global food_items, food_requests, food_categories

    with get_db() as conn:
        listings = conn.execute(
            "SELECT * FROM food_items ORDER BY id DESC"
        ).fetchall()

        requests = conn.execute("""
            SELECT r.*, f.name AS food_name
            FROM food_requests r
            JOIN food_items f ON f.id = r.food_id
            ORDER BY r.id DESC
        """).fetchall()

    food_items = {row["id"]: dict(row) for row in listings}
    food_requests = [dict(row) for row in requests]
    food_categories = {
        item["category"] for item in food_items.values()
    }


@app.route("/")
def home():
    refresh_data()

    today = date.today().isoformat()

    available_items = [
        item for item in food_items.values()
        if item["status"] == "available"
        and item["available_until"] >= today
    ]

    with get_db() as conn:
        total_donations = conn.execute("""
            SELECT COUNT(*) FROM food_items
            WHERE offer_type = 'free'
        """).fetchone()[0]

        total_requests = conn.execute(
            "SELECT COUNT(*) FROM food_requests"
        ).fetchone()[0]

    return render_template(
        "index.html",
        food_items=available_items,
        all_items=list(food_items.values()),
        requests=food_requests,
        categories=sorted(food_categories),
        total_donations=total_donations,
        total_requests=total_requests,
        today=today
    )

@app.route("/find-food")
def find_food_page():
    refresh_data()

    today = date.today().isoformat()

    available_items = [
        item for item in food_items.values()
        if item["status"] == "available"
        and item["available_until"] >= today
    ]

    return render_template(
        "find_food.html",
        food_items=available_items,
        today=today
    )


@app.route("/share-food")
def share_food_page():
    today = date.today().isoformat()

    return render_template(
        "share_food.html",
        today=today
    )


@app.route("/requests")
def requests_page():
    refresh_data()

    return render_template(
        "requests.html",
        requests=food_requests
    )


@app.route("/manage")
def manage_page():
    refresh_data()

    return render_template(
        "manage.html",
        all_items=list(food_items.values()),
        today=date.today().isoformat()
    )



@app.route("/post", methods=["POST"])
def post_food():
    donor_name = request.form.get("donor_name", "").strip()
    name = request.form.get("name", "").strip()
    category = request.form.get("category", "Other").strip()
    quantity = request.form.get("quantity", "").strip()
    offer_type = request.form.get("offer_type", "free")
    price_text = request.form.get("price", "0").strip()
    pickup_location = request.form.get("pickup_location", "").strip()
    available_until = request.form.get("available_until", "")
    description = request.form.get("description", "").strip()
    contact_number = request.form.get("contact_number", "").strip()
    image = request.files.get("food_image")
    image_filename = ""

    if not all([
        donor_name, name, category, quantity,
        pickup_location, available_until
    ]):
        flash("Please complete all required food details.")
        return redirect(url_for("home"))

    if offer_type not in ("free", "sale"):
        flash("Please choose donation or reduced-price sale.")
        return redirect(url_for("home"))

    try:
        price = float(price_text or 0)
        if price < 0 or (offer_type == "sale" and price <= 0):
            raise ValueError
    except ValueError:
        flash("Enter a valid price greater than zero for sales.")
        return redirect(url_for("home"))

    if offer_type == "free":
        price = 0

    if available_until < date.today().isoformat():
        flash("The collection deadline cannot be in the past.")
        return redirect(url_for("home"))
        
    # Check the optional food image
    if image and image.filename:
        original_name = secure_filename(image.filename)

        if (
            not original_name
            or "." not in original_name
            or original_name.rsplit(".", 1)[1].lower()
            not in ALLOWED_IMAGE_EXTENSIONS
        ):
            flash("Please upload a JPG, JPEG, PNG, or WEBP image.")
            return redirect(url_for("home"))

        # Generate a unique filename to avoid overwriting other images
        extension = original_name.rsplit(".", 1)[1].lower()
        image_filename = f"{uuid.uuid4().hex}.{extension}"

        upload_folder = Path(app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)

        image.save(upload_folder / image_filename)


    with get_db() as conn:
        conn.execute("""
            INSERT INTO food_items (
                donor_name, name, category, quantity,
                offer_type, price, pickup_location,
                available_until, description,
                contact_number, image_filename
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            donor_name, name, category, quantity,
            offer_type, price, pickup_location,
            available_until, description,
            contact_number, image_filename
        ))


    activity_history.append(f"Food listed: {name}")
    flash("Your food listing has been published!")
    return redirect(url_for("home"))


@app.route("/request/<int:food_id>", methods=["POST"])
def request_food(food_id):
    requester_name = request.form.get(
        "requester_name", ""
    ).strip()
    organization = request.form.get("organization", "").strip()
    message = request.form.get("message", "").strip()

    if not requester_name:
        flash("Please enter your name or organization contact name.")
        return redirect(url_for("home"))

    with get_db() as conn:
        item = conn.execute(
            "SELECT * FROM food_items WHERE id = ?",
            (food_id,)
        ).fetchone()

        if not item:
            flash("This food listing could not be found.")
            return redirect(url_for("home"))

        if item["status"] != "available":
            flash("This food is no longer available.")
            return redirect(url_for("home"))

        if item["available_until"] < date.today().isoformat():
            flash("The collection deadline for this listing has passed.")
            return redirect(url_for("home"))

        conn.execute("""
            INSERT INTO food_requests (
                food_id, requester_name, organization,
                message, created_at
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            food_id, requester_name, organization,
            message, date.today().isoformat()
        ))

    activity_history.append(f"Request received for: {item['name']}")
    flash("Your request has been submitted!")
    return redirect(url_for("home"))


@app.route("/request/<int:request_id>/status", methods=["POST"])
def update_request(request_id):
    new_status = request.form.get("status", "")

    if new_status not in ("accepted", "rejected", "collected"):
        flash("Invalid request status.")
        return redirect(url_for("home"))

    with get_db() as conn:
        req = conn.execute("""
            SELECT r.*, f.status AS food_status
            FROM food_requests r
            JOIN food_items f ON f.id = r.food_id
            WHERE r.id = ?
        """, (request_id,)).fetchone()

        if not req:
            flash("Request not found.")
            return redirect(url_for("home"))

        if new_status == "accepted":
            if req["status"] != "pending" or req["food_status"] != "available":
                flash("This request can no longer be accepted.")
                return redirect(url_for("home"))

            conn.execute("""
                UPDATE food_requests SET status = 'rejected'
                WHERE food_id = ? AND id != ? AND status = 'pending'
            """, (req["food_id"], request_id))

            conn.execute("""
                UPDATE food_items SET status = 'reserved'
                WHERE id = ?
            """, (req["food_id"],))

        elif new_status == "rejected":
            if req["status"] != "pending":
                flash("Only pending requests can be rejected.")
                return redirect(url_for("home"))

        elif new_status == "collected":
            if req["status"] != "accepted":
                flash("Only accepted requests can be marked collected.")
                return redirect(url_for("home"))

            conn.execute("""
                UPDATE food_items SET status = 'collected'
                WHERE id = ?
            """, (req["food_id"],))

        conn.execute("""
            UPDATE food_requests SET status = ?
            WHERE id = ?
        """, (new_status, request_id))

    activity_history.append(f"Request {request_id}: {new_status}")
    flash(f"Request marked as {new_status}.")
    return redirect(url_for("home"))


@app.route("/delete/<int:food_id>", methods=["POST"])
def delete_food(food_id):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM food_items WHERE id = ?",
            (food_id,)
        )

    flash("Food listing deleted.")
    return redirect(url_for("home"))


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
