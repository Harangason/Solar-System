import tempfile
import unittest
from pathlib import Path

from project_store import ProjectStore


def project_values(name: str = "Testmission"):
    return {
        "name": name,
        "description": "Erde nach Jupiter",
        "state": {
            "schemaVersion": 1,
            "viewMode": "2d",
            "routeSections": [{"id": "section-1", "originId": "earth", "targetId": "jupiter"}],
            "activeRouteSectionId": "section-1",
            "plannedMissionDate": None,
            "plannedRoute": None,
            "missionConfig": None,
            "visualConfig": None,
            "missionResult": None,
        },
    }


class ProjectStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.store = ProjectStore(Path(self.temporary_directory.name) / "projects.db")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_create_list_and_load_project(self):
        created = self.store.create_project(project_values())

        self.assertEqual(created["name"], "Testmission")
        self.assertEqual(created["revision"], 1)
        self.assertEqual(created["routeSectionCount"], 1)
        self.assertEqual(created["state"]["activeRouteSectionId"], "section-1")
        self.assertEqual(self.store.list_projects()[0]["id"], created["id"])

    def test_update_creates_new_revision_without_changing_id(self):
        created = self.store.create_project(project_values())
        values = project_values("Testmission aktualisiert")
        values["state"]["plannedMissionDate"] = "2029-12-26"

        updated = self.store.update_project(created["id"], values)

        self.assertEqual(updated["id"], created["id"])
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["state"]["plannedMissionDate"], "2029-12-26")

    def test_rejects_blank_name_and_wrong_schema(self):
        with self.assertRaisesRegex(ValueError, "Projektnamen"):
            self.store.create_project(project_values(" "))
        values = project_values()
        values["state"]["schemaVersion"] = 99
        with self.assertRaisesRegex(ValueError, "Projektschema"):
            self.store.create_project(values)

    def test_delete_removes_only_selected_project(self):
        first = self.store.create_project(project_values("Erstes Projekt"))
        second = self.store.create_project(project_values("Zweites Projekt"))

        self.store.delete_project(first["id"])

        self.assertEqual([project["id"] for project in self.store.list_projects()], [second["id"]])
        with self.assertRaisesRegex(LookupError, "nicht gefunden"):
            self.store.get_project(first["id"])


if __name__ == "__main__":
    unittest.main()
